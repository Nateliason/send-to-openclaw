# Send to Clawdbot — Chrome Extension + Webhook Server

## Overview
A Chrome extension that grabs readable content from any web page and sends it to a Clawdbot instance via a configurable webhook. Includes a lightweight webhook server that receives the content and triggers a Clawdbot wake event.

Designed to be open source — no hardcoded URLs, tokens, or personal info anywhere.

## Chrome Extension

### Features
1. **Toolbar button** — click to send the full page content
2. **Selection support** — if text is highlighted, send only the selection instead of full page
3. **Context menu** — right-click "Send to Clawdbot" option (works on selection or full page)
4. **Message input** — popup with a text field where the user can type additional context/instructions before sending (e.g., "summarize this" or "save this to the AFA project")
5. **Page metadata** — always include: page URL, page title, timestamp
6. **Clean extraction** — strip nav, ads, footers. Use a Readability-style approach to get the article/document body text. For simple pages, document.body.innerText is fine as fallback.
7. **Status feedback** — show success/error state in the popup after sending

### Configuration (extension options page)
- **Webhook URL** — the URL to POST to (e.g., http://100.x.x.x:3847/send-to-clawdbot)
- **Auth token** — optional bearer token for the webhook
- Save settings in chrome.storage.sync

### Manifest
- Manifest V3
- Permissions: activeTab, storage, contextMenus
- No broad host permissions — only needs activeTab

## Webhook Server

### Simple Express.js server

**Endpoint:** `POST /send-to-clawdbot`

**Request body (JSON):**
```json
{
  "url": "https://...",
  "title": "Page Title",
  "content": "The extracted text...",
  "selection": "Optional highlighted text",
  "message": "Optional user message/instructions",
  "timestamp": "2026-01-30T19:00:00Z"
}
```

**Auth:** Optional bearer token check (configurable via env var `WEBHOOK_TOKEN`)

**Action:** Runs `clawdbot gateway wake` with the content formatted as a message:
```
📎 Page sent from browser: {title}
URL: {url}
{message if provided}

---
{selection || content}
```

The wake text should be formatted so Clawdbot treats it as a user-initiated share.

**Response:** 200 OK with `{ "ok": true }` or appropriate error.

### Configuration (env vars)
- `PORT` — default 3847
- `WEBHOOK_TOKEN` — optional auth token
- `CLAWDBOT_WAKE_MODE` — "now" (default) or "next-heartbeat"

### Running
- `node server.js` or `npm start`
- Include a simple systemd/launchd service file for running as a daemon

## File Structure
```
send-to-clawdbot/
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── popup.css
│   ├── background.js
│   ├── content.js (if needed for extraction)
│   ├── options.html
│   ├── options.js
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── server/
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── README.md
├── LICENSE (MIT)
└── .gitignore
```

## README.md should include
- What it does (screenshot-friendly description)
- Quick start: install extension + run server
- Configuration steps
- How to set up with Clawdbot
- How to use (toolbar button, selection, context menu, message field)
- No personal info — all config is via the options page and env vars

## Important
- NO hardcoded URLs, tokens, usernames, or personal info anywhere
- All configuration via the extension options page and server env vars
- Keep it simple — this is a utility, not a framework
- MIT license
- Icons can be simple/placeholder — a paper airplane or share icon
