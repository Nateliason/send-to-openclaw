# Send to OpenClaw 🦞

A Chrome extension + local webhook server that lets you send any web page (or Google Doc) to your Clawdbot instance with one click.

## What it does

- **Regular pages**: extracts the main readable text (or your highlighted selection)
- **Google Docs**: fetches clean plain text via the export API — no auth setup needed, uses your existing Google login
- **Optional message**: add instructions or context before sending
- Formats everything and injects it into your Clawdbot session via `clawdbot system event`

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/Nateliason/send-to-openclaw.git
cd send-to-openclaw
```

### 2. Start the webhook server

```bash
cd server
npm install
cp .env.example .env   # edit if you want to change port or add a token
npm start
```

The server listens on `http://localhost:3847/send-to-openclaw` by default.

**Environment variables** (set in `server/.env`):
| Variable | Default | Description |
|---|---|---|
| `PORT` | `3847` | Server port |
| `WEBHOOK_TOKEN` | _(empty)_ | Optional bearer token for auth |
| `CLAWDBOT_WAKE_MODE` | `now` | `now` or `next-heartbeat` |

### 3. Load the Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder
4. Click the extension's **Options** and set:
   - **Webhook URL**: `http://localhost:3847/send-to-openclaw`
   - **Auth token**: your `WEBHOOK_TOKEN` if you set one

### 4. Run the server as a service (optional)

**macOS (launchd):**
```bash
# Edit paths in the plist first
cp server/com.sendtoopenclaw.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.sendtoopenclaw.plist
```

**Linux (systemd):**
```bash
# Edit paths in the service file first
sudo cp server/send-to-openclaw.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now send-to-openclaw
```

## Usage

- **Click the toolbar icon** → optionally add a message → hit **Send**
- **Right-click** any page or selection → **Send to OpenClaw**
- **Keyboard shortcut**: `Alt+Shift+S` captures selection and opens the popup

### Google Docs

Just open a Google Doc and click Send. The extension detects `docs.google.com/document/` URLs and fetches the doc as plain text using your browser session — no Google API credentials or OAuth needed. Works with private docs you have access to.

## What your Clawdbot receives

```
📎 Page sent from browser: Document Title
URL: https://example.com/page
Time: 2026-01-30T21:00:05.560Z

Your optional message here

---
The page content or Google Doc text...
```

## Requirements

- [Clawdbot](https://github.com/clawdbot/clawdbot) installed and running
- Node.js 18+
- Chrome or Chromium-based browser

## License

MIT
