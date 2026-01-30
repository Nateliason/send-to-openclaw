const statusEl = document.getElementById("status");
const sendBtn = document.getElementById("send");
const optionsBtn = document.getElementById("open-options");
const messageEl = document.getElementById("message");

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = `status ${kind || ""}`.trim();
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["webhookUrl", "authToken"], (data) => {
      resolve({
        webhookUrl: data.webhookUrl || "",
        authToken: data.authToken || ""
      });
    });
  });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function cleanWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function extractPageContent() {
  const selection = window.getSelection ? window.getSelection().toString().trim() : "";

  function removeNoise(root) {
    const selectors = [
      "script",
      "style",
      "noscript",
      "nav",
      "footer",
      "header",
      "aside",
      "form",
      "button",
      "input",
      "textarea",
      "svg",
      "canvas",
      "iframe",
      "[role='navigation']",
      "[role='banner']",
      "[role='contentinfo']",
      "[aria-hidden='true']",
      ".ad",
      ".ads",
      ".advert",
      ".advertisement",
      ".promo",
      ".subscribe",
      ".newsletter"
    ];
    selectors.forEach((selector) => {
      root.querySelectorAll(selector).forEach((node) => node.remove());
    });
  }

  function pickBestText(root) {
    const candidates = Array.from(
      root.querySelectorAll("article, main, [role='main'], section, div")
    );
    let bestText = "";
    let bestScore = 0;

    candidates.forEach((el) => {
      const text = el.innerText ? el.innerText.trim() : "";
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const score = wordCount + Math.min(2000, text.length) / 10;
      if (score > bestScore && wordCount > 80) {
        bestScore = score;
        bestText = text;
      }
    });

    if (bestText) {
      return bestText;
    }
    return root.innerText || "";
  }

  const clone = document.body ? document.body.cloneNode(true) : document.documentElement.cloneNode(true);
  removeNoise(clone);
  let content = pickBestText(clone);
  if (!content && document.body) {
    content = document.body.innerText || "";
  }

  return {
    url: location.href,
    title: document.title || "Untitled",
    selection,
    content
  };
}

async function sendToWebhook() {
  setStatus("", "");
  sendBtn.disabled = true;

  const settings = await getSettings();
  if (!settings.webhookUrl) {
    setStatus("Set a webhook URL in Options first.", "error");
    sendBtn.disabled = false;
    return;
  }

  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    setStatus("No active tab found.", "error");
    sendBtn.disabled = false;
    return;
  }

  let payload;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageContent
    });

    payload = {
      url: result.url,
      title: result.title,
      content: cleanWhitespace(result.content || ""),
      selection: cleanWhitespace(result.selection || ""),
      message: messageEl.value.trim(),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    setStatus("Failed to read page content.", "error");
    sendBtn.disabled = false;
    return;
  }

  try {
    const res = await fetch(settings.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(settings.authToken ? { Authorization: `Bearer ${settings.authToken}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    setStatus("Sent to Clawdbot.", "ok");
    messageEl.value = "";
  } catch (error) {
    setStatus("Failed to send. Check webhook URL/token.", "error");
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener("click", () => {
  sendToWebhook();
});

optionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

setStatus("Ready.");
