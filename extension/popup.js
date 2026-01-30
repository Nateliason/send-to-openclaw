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
    chrome.storage.sync.get(["webhookUrl", "authToken", "displayName"], (data) => {
      resolve({
        webhookUrl: data.webhookUrl || "",
        authToken: data.authToken || "",
        displayName: data.displayName || "OpenClaw"
      });
    });
  });
}

// Load display name into heading on startup
chrome.storage.sync.get(["displayName"], (data) => {
  const name = data.displayName || "OpenClaw";
  const heading = document.getElementById("popup-title");
  if (heading) heading.textContent = `Send to ${name}`;
  document.title = `Send to ${name}`;
});

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function cleanWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

// Extract Google Doc ID from URL
function getGoogleDocId(url) {
  const match = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Fetch Google Doc as plain text by running fetch inside the tab (same-origin = cookies work)
async function fetchGoogleDocText(tabId, docId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (id) => {
      try {
        const res = await fetch(`https://docs.google.com/document/d/${id}/export?format=txt`);
        if (!res.ok) return { error: `HTTP ${res.status}` };
        return { text: await res.text() };
      } catch (e) {
        return { error: e.message };
      }
    },
    args: [docId]
  });
  if (result.error) throw new Error(result.error);
  return result.text;
}

// Generic page content extraction (for non-Google-Docs sites)
function extractPageContent() {
  const selection = window.getSelection ? window.getSelection().toString().trim() : "";

  function trySiteSpecific() {
    const host = location.hostname;
    if (host === "notes.granola.ai" || host === "www.notion.so") {
      const main = document.querySelector("main, [role='main'], article");
      if (main) return main.innerText.trim();
    }
    return null;
  }

  function removeNoise(root) {
    const selectors = [
      "script", "style", "noscript", "nav", "footer", "header", "aside",
      "form", "button", "input", "textarea", "svg", "canvas", "iframe",
      "[role='navigation']", "[role='banner']", "[role='contentinfo']",
      "[aria-hidden='true']", ".ad", ".ads", ".advert", ".advertisement",
      ".promo", ".subscribe", ".newsletter"
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
    return bestText || (root.innerText || "");
  }

  let content = trySiteSpecific();
  if (!content) {
    const clone = document.body ? document.body.cloneNode(true) : document.documentElement.cloneNode(true);
    removeNoise(clone);
    content = pickBestText(clone);
    if (!content && document.body) {
      content = document.body.innerText || "";
    }
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
  sendBtn.classList.add("loading");

  const settings = await getSettings();
  if (!settings.webhookUrl) {
    setStatus("Set a webhook URL in Options first.", "error");
    sendBtn.classList.remove("loading");
    sendBtn.disabled = false;
    return;
  }

  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    setStatus("No active tab found.", "error");
    sendBtn.classList.remove("loading");
    sendBtn.disabled = false;
    return;
  }

  let payload;
  try {
    const docId = getGoogleDocId(tab.url || "");

    if (docId) {
      // Google Docs: fetch clean plain text via export URL
      setStatus("Fetching doc…", "");
      const docText = await fetchGoogleDocText(tab.id, docId);
      payload = {
        url: tab.url,
        title: tab.title || "Google Doc",
        content: docText.trim(),
        selection: "",
        message: messageEl.value.trim(),
        timestamp: new Date().toISOString()
      };
    } else {
      // All other sites: use content script extraction
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
    }
  } catch (error) {
    setStatus(`Failed to read page: ${error.message}`, "error");
    sendBtn.classList.remove("loading");
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

    setStatus(`Sent to ${settings.displayName}.`, "ok");
    messageEl.value = "";
  } catch (error) {
    setStatus("Failed to send. Check webhook URL/token.", "error");
  } finally {
    sendBtn.classList.remove("loading");
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
