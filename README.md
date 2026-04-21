# MeetMinder

A Chrome extension that shows your next meeting at a glance and lets you join with one click.

Connects to Google Calendar and displays today's meetings in your browser toolbar, with a countdown to your next meeting, one-click join links for Google Meet, Zoom, and Teams, and optional desktop notifications.

## Features

- **Next meeting card** - shows your upcoming meeting with a live countdown
- **One-click join** - detects Google Meet, Zoom, and Teams links and opens them instantly
- **Today's meeting list** - full list of today's meetings with platform badges
- **Badge counter** - shows time to next meeting on the extension icon (e.g. "15m", "NOW")
- **Desktop notifications** - optional reminder before your meeting starts
- **Auto-refresh** - checks your calendar every 5 minutes in the background
- **Attendee summary** - shows who else is in the meeting

## Setup

MeetMinder requires a Google OAuth Client ID to read your Google Calendar.

### 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project
3. Enable the **Google Calendar API**

### 2. Create OAuth credentials

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Choose **Chrome Extension** as the application type
4. Enter your extension ID (found at `chrome://extensions` after loading it)
5. Copy the generated Client ID

### 3. Add your Client ID

Open `background.js` and replace the placeholder:

```js
const CLIENT_ID = 'YOUR_GOOGLE_OAUTH_CLIENT_ID';
```

### 4. Load the extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `meetminder` folder

## Permissions

| Permission | Reason |
|---|---|
| `identity` | Handles Google OAuth sign-in flow |
| `storage` | Caches calendar events and auth token locally |
| `alarms` | Schedules background refresh and meeting notifications |
| `notifications` | Shows desktop alerts before meetings start |

### Google API scopes

| Scope | Reason |
|---|---|
| `calendar.readonly` | Reads today's calendar events to display meetings and join links |

## File Structure

```
meetminder/
  manifest.json   Extension config and permissions
  background.js   Service worker - auth, calendar fetching, badge, notifications
  popup.html      Extension popup UI and styles
  popup.js        Popup logic - renders next meeting, countdown, and meeting list
  icons/          Extension icons (16px, 48px, 128px)
```

## Licence

MIT
