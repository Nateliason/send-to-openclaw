const express = require("express");
const { spawn } = require("child_process");

require("dotenv").config();

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3847;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || "";
const CLAWDBOT_WAKE_MODE = ["now", "next-heartbeat"].includes(process.env.CLAWDBOT_WAKE_MODE)
  ? process.env.CLAWDBOT_WAKE_MODE
  : "now";

function isAuthorized(req) {
  if (!WEBHOOK_TOKEN) {
    return true;
  }
  const authHeader = req.headers.authorization || "";
  return authHeader === `Bearer ${WEBHOOK_TOKEN}`;
}

function formatWakeText(payload) {
  const lines = [
    `📎 Page sent from browser: ${payload.title || "Untitled"}`,
    `URL: ${payload.url || ""}`,
    payload.timestamp ? `Time: ${payload.timestamp}` : ""
  ];

  if (payload.message) {
    lines.push("");
    lines.push(payload.message);
  }

  lines.push("");
  lines.push("---");
  lines.push(payload.selection || payload.content || "");

  return lines.filter((line) => line !== "").join("\n");
}

app.post("/send-to-clawdbot", (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { url, title, content, selection, message, timestamp } = req.body || {};
  if (!url || !title || (!content && !selection)) {
    return res.status(400).json({
      ok: false,
      error: "Missing required fields (url, title, content or selection)."
    });
  }

  const wakeText = formatWakeText({
    url,
    title,
    content,
    selection,
    message,
    timestamp
  });

  const args = ["gateway", "wake", "--text", wakeText, "--mode", CLAWDBOT_WAKE_MODE];
  const child = spawn("clawdbot", args, { stdio: "ignore" });

  child.on("error", (error) => {
    res.status(500).json({ ok: false, error: error.message });
  });

  child.on("close", (code) => {
    if (code === 0) {
      res.json({ ok: true });
    } else {
      res.status(500).json({ ok: false, error: `clawdbot exited with ${code}` });
    }
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Send to Clawdbot server listening on ${PORT}`);
});
