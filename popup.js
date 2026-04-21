// ── Helpers ────────────────────────────────────────────────
function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date) {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatCountdown(ms) {
  if (ms <= 0) return 'Starting now';
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `in ${mins} minute${mins !== 1 ? 's' : ''}`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `in ${hrs}h ${rem}m` : `in ${hrs}h`;
}

function extractJoinUrl(event) {
  if (event.hangoutLink) return { url: event.hangoutLink, type: 'meet', label: 'Join Google Meet' };

  // Check conferenceData (Zoom, Teams integrations)
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
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&');
  const zoom  = text.match(/https?:\/\/[a-z0-9.]*zoom\.us\/[^\s<"]+/i);
  if (zoom)  return { url: zoom[0].replace(/&amp;/g, '&'), type: 'zoom',  label: 'Join Zoom' };
  const teams = text.match(/https?:\/\/teams\.microsoft\.com\/[^\s<"]+/i);
  if (teams) return { url: teams[0], type: 'teams', label: 'Join Teams' };
  const any   = text.match(/https?:\/\/[^\s<"]+/i);
  if (any)   return { url: any[0],   type: 'other', label: 'Join meeting' };
  return null;
}

function getEventStart(event) {
  return new Date(event.start.dateTime || event.start.date);
}

function getEventEnd(event) {
  return new Date(event.end.dateTime || event.end.date);
}

function getAttendeeString(event) {
  const attendees = event.attendees || [];
  const others    = attendees.filter(a => !a.self).map(a => a.displayName || a.email.split('@')[0]);
  if (!others.length) return '';
  if (others.length <= 2) return others.join(', ');
  return `${others.slice(0, 2).join(', ')} +${others.length - 2}`;
}

// ── Set today's date ───────────────────────────────────────
document.getElementById('today-date').textContent = formatDate(new Date());

// ── UI refs ────────────────────────────────────────────────
const signInWrap  = document.getElementById('sign-in-wrap');
const signInBtn   = document.getElementById('sign-in-btn');
const signOutBtn  = document.getElementById('sign-out-btn');
const loadingEl   = document.getElementById('loading');
const nextWrap    = document.getElementById('next-wrap');
const nextLabel   = document.getElementById('next-label');
const nextTitle   = document.getElementById('next-title');
const nextMeta    = document.getElementById('next-meta');
const joinBtn     = document.getElementById('join-btn');
const joinLabel   = document.getElementById('join-label');
const noMeetings  = document.getElementById('no-meetings');
const listTitle   = document.getElementById('list-title');
const meetingList = document.getElementById('meeting-list');
const footer      = document.getElementById('footer');

function showLoading() {
  signInWrap.classList.remove('visible');
  loadingEl.classList.add('visible');
}

function showSignIn() {
  loadingEl.classList.remove('visible');
  signInWrap.classList.add('visible');
  signOutBtn.style.display  = 'none';
  refreshBtn.style.display  = 'none';
  nextWrap.classList.remove('visible');
  noMeetings.classList.remove('visible');
  listTitle.style.display   = 'none';
  meetingList.innerHTML     = '';
  footer.style.display      = 'none';
}

function renderEvents(events) {
  loadingEl.classList.remove('visible');
  signInWrap.classList.remove('visible');
  signOutBtn.style.display  = 'block';
  refreshBtn.style.display  = 'block';
  footer.style.display      = 'block';

  const now  = Date.now();
  const next = events.find(e => getEventEnd(e).getTime() > now);

  if (next) {
    const startMs  = getEventStart(next).getTime();
    const diffMs   = startMs - now;
    const isNow    = diffMs <= 0;
    const join     = extractJoinUrl(next);
    const attendees = getAttendeeString(next);

    nextLabel.textContent = isNow ? 'Happening now' : `Up next · ${formatCountdown(diffMs)}`;
    nextTitle.textContent = next.summary || 'Untitled meeting';
    nextMeta.textContent  = `${formatTime(next.start.dateTime || next.start.date)} – ${formatTime(next.end.dateTime || next.end.date)}${attendees ? ' · ' + attendees : ''}`;

    if (join) {
      joinBtn.href      = join.url;
      joinBtn.className = `join-btn ${join.type}`;
      joinLabel.textContent = join.label;
      joinBtn.style.display = 'inline-flex';
    } else {
      joinBtn.style.display = 'none';
    }

    nextWrap.classList.add('visible');
    noMeetings.classList.remove('visible');
  } else {
    nextWrap.classList.remove('visible');
    noMeetings.classList.add('visible');
  }

  if (events.length) {
    listTitle.style.display = 'block';
    meetingList.innerHTML   = events.map(event => {
      const start    = getEventStart(event);
      const end      = getEventEnd(event);
      const isPast   = end.getTime() < now;
      const isNext   = next && event === next;
      const join     = extractJoinUrl(event);
      const badge    = join ? `<span class="meet-badge ${join.type}">${join.type === 'meet' ? 'Meet' : join.type === 'zoom' ? 'Zoom' : join.type === 'teams' ? 'Teams' : 'Link'}</span>` : '';

      return `<div class="meeting-row ${isPast ? 'past' : ''}">
        <div class="meeting-time">${formatTime(start.toISOString())}</div>
        <div class="meeting-dot ${isPast ? 'past' : ''}"></div>
        <div class="meeting-info">
          <div class="meeting-title ${isNext ? 'upcoming' : ''}">${event.summary || 'Untitled'}</div>
        </div>
        ${badge}
      </div>`;
    }).join('');
  } else {
    listTitle.style.display = 'none';
  }
}

const refreshBtn  = document.getElementById('refresh-btn');

// ── Refresh ────────────────────────────────────────────────
refreshBtn.addEventListener('click', async () => {
  refreshBtn.textContent = '↻ …';
  await chrome.storage.local.remove(['events', 'lastFetched']);
  await loadEvents();
  refreshBtn.textContent = '↻ Refresh';
});
signInBtn.addEventListener('click', async () => {
  signInBtn.disabled    = true;
  signInBtn.textContent = 'Connecting…';
  const res = await chrome.runtime.sendMessage({ type: 'SIGN_IN' });
  if (res?.ok) {
    showLoading();
    loadEvents();
  } else {
    signInBtn.disabled    = false;
    signInBtn.textContent = 'Sign in with Google';
    console.error('Sign in failed:', res?.error);
    alert('Sign in failed: ' + (res?.error || 'unknown error'));
  }
});

// ── Sign out ───────────────────────────────────────────────
signOutBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SIGN_OUT' });
  showSignIn();
});

// ── Load events ────────────────────────────────────────────
async function loadEvents() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_EVENTS' });
  if (res?.error === 'not_signed_in') {
    showSignIn();
    return;
  }
  if (res?.events) {
    renderEvents(res.events);
  }
}

// ── Init ───────────────────────────────────────────────────
showLoading();
loadEvents();
