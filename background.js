const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const CHECK_INTERVAL = 5; // minutes
const CLIENT_ID = 'YOUR_GOOGLE_OAUTH_CLIENT_ID';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

// ── Auth via launchWebAuthFlow (works in all Chromium browsers) ──
async function getToken(interactive = false) {
  // Return cached token if still valid
  const cache = await chrome.storage.local.get({ token: null, tokenExpiry: 0 });
  if (cache.token && Date.now() < cache.tokenExpiry - 60000) {
    return cache.token;
  }

  if (!interactive) return null;

  const redirectUrl = chrome.identity.getRedirectURL();
  const authUrl = 'https://accounts.google.com/o/oauth2/auth?' + new URLSearchParams({
    client_id:     CLIENT_ID,
    response_type: 'token',
    redirect_uri:  redirectUrl,
    scope:         SCOPES,
  });

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          console.error('Auth error:', chrome.runtime.lastError?.message);
          resolve(null);
          return;
        }
        // Extract token from URL fragment
        const hash   = new URL(responseUrl).hash.slice(1);
        const params = new URLSearchParams(hash);
        const token  = params.get('access_token');
        const expiry = Date.now() + parseInt(params.get('expires_in') || '3600') * 1000;

        if (token) {
          chrome.storage.local.set({ token, tokenExpiry: expiry });
          resolve(token);
        } else {
          resolve(null);
        }
      }
    );
  });
}

async function clearToken() {
  await chrome.storage.local.remove(['token', 'tokenExpiry']);
}

// ── Fetch calendar events ─────────────────────────────────
async function fetchEvents(token) {
  const now = new Date();
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const url = `${CALENDAR_API}/calendars/primary/events?` + new URLSearchParams({
    timeMin:             now.toISOString(),
    timeMax:             end.toISOString(),
    singleEvents:        'true',
    orderBy:             'startTime',
    maxResults:          '20',
    conferenceDataVersion: '1',
  });

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 401) await clearToken();
    return null;
  }
  const data = await res.json();
  // Filter out all-day events (they have start.date not start.dateTime)
  return (data.items || []).filter(e => e.start.dateTime);
}

function extractJoinUrl(event) {
  if (event.hangoutLink) return { url: event.hangoutLink, type: 'meet', label: 'Join Google Meet' };

  // Check conferenceData (used by Zoom, Teams and other Calendar integrations)
  const entryPoints = event.conferenceData?.entryPoints || [];
  const videoEntry  = entryPoints.find(e => e.entryPointType === 'video');
  if (videoEntry?.uri) {
    const url  = videoEntry.uri.replace(/&amp;/g, '&');
    const type = url.includes('zoom.us') ? 'zoom' : url.includes('teams.microsoft') ? 'teams' : 'other';
    const label = type === 'zoom' ? 'Join Zoom' : type === 'teams' ? 'Join Teams' : 'Join meeting';
    return { url, type, label };
  }

  // Fall back to scanning description and location
  const raw  = [event.location || '', event.description || ''].join(' ');
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  const zoom  = text.match(/https?:\/\/[a-z0-9.]*zoom\.us\/[^\s<"]+/i);
  if (zoom)  return { url: zoom[0].replace(/&amp;/g, '&'), type: 'zoom',  label: 'Join Zoom' };

  const teams = text.match(/https?:\/\/teams\.microsoft\.com\/[^\s<"]+/i);
  if (teams) return { url: teams[0], type: 'teams', label: 'Join Teams' };

  const webex = text.match(/https?:\/\/[a-z0-9.]*webex\.com\/[^\s<"]+/i);
  if (webex) return { url: webex[0], type: 'other', label: 'Join Webex' };

  const any   = text.match(/https?:\/\/[^\s<"]+/i);
  if (any)   return { url: any[0],   type: 'other', label: 'Join meeting' };

  return null;
}

function getEventStart(event) {
  return new Date(event.start.dateTime || event.start.date);
}

// ── Badge ─────────────────────────────────────────────────
async function updateBadge(events) {
  if (!events?.length) { chrome.action.setBadgeText({ text: '' }); return; }
  const now  = Date.now();
  const next = events.find(e => getEventStart(e).getTime() > now - 60000);
  if (!next)  { chrome.action.setBadgeText({ text: '' }); return; }

  const diffMins = Math.ceil((getEventStart(next).getTime() - now) / 60000);
  chrome.action.setBadgeBackgroundColor({ color: '#E24B4A' });
  if (diffMins <= 0)   chrome.action.setBadgeText({ text: 'NOW' });
  else if (diffMins < 60) chrome.action.setBadgeText({ text: `${diffMins}m` });
  else chrome.action.setBadgeText({ text: '' });
}

// ── Notifications ─────────────────────────────────────────
async function scheduleNotification(events) {
  if (!events) return;
  const settings = await chrome.storage.sync.get({ notifyMins: 5, notifyEnabled: true });
  if (!settings.notifyEnabled) return;

  const now  = Date.now();
  const next = events.find(e => getEventStart(e).getTime() > now);
  if (!next) return;

  const notifyAt = getEventStart(next).getTime() - settings.notifyMins * 60000;
  await chrome.alarms.clear('meetminder-notify');
  if (notifyAt > now) {
    chrome.alarms.create('meetminder-notify', { when: notifyAt });
    await chrome.storage.local.set({ pendingNotifyEvent: JSON.stringify(next) });
  }
}

// ── Refresh ───────────────────────────────────────────────
async function refresh() {
  const token = await getToken(false);
  if (!token) return;

  const events = await fetchEvents(token);
  if (!events) return;

  await chrome.storage.local.set({ events: JSON.stringify(events), lastFetched: Date.now() });
  await updateBadge(events);
  await scheduleNotification(events);
}

// ── Alarms ────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'meetminder-refresh') await refresh();
  if (alarm.name === 'meetminder-notify') {
    const data = await chrome.storage.local.get({ pendingNotifyEvent: null });
    if (!data.pendingNotifyEvent) return;
    const event = JSON.parse(data.pendingNotifyEvent);
    chrome.notifications.create('meetminder-alert', {
      type: 'basic', iconUrl: 'icons/icon128.png',
      title: `Starting soon: ${event.summary}`,
      message: 'Click the MeetMinder icon to join.',
      requireInteraction: false,
    });
  }
});

// ── Messages ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_EVENTS') {
    (async () => {
      const token = await getToken(false);
      if (!token) { sendResponse({ error: 'not_signed_in' }); return; }

      const cache = await chrome.storage.local.get({ events: null, lastFetched: 0 });
      if (cache.events && Date.now() - cache.lastFetched < 2 * 60000) {
        sendResponse({ events: JSON.parse(cache.events) }); return;
      }

      const events = await fetchEvents(token);
      if (!events) { sendResponse({ error: 'fetch_failed' }); return; }

      await chrome.storage.local.set({ events: JSON.stringify(events), lastFetched: Date.now() });
      await updateBadge(events);
      await scheduleNotification(events);
      sendResponse({ events });
    })();
    return true;
  }

  if (msg.type === 'SIGN_IN') {
    (async () => {
      const token = await getToken(true);
      if (!token) { sendResponse({ error: 'auth_failed' }); return; }
      await refresh();
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'SIGN_OUT') {
    (async () => {
      await clearToken();
      chrome.storage.local.clear();
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ ok: true });
    })();
    return true;
  }
});

// ── Init ──────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('meetminder-refresh', {
    delayInMinutes: 1, periodInMinutes: CHECK_INTERVAL,
  });
});

chrome.runtime.onStartup.addListener(refresh);
