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

  // Special handling for tricky sites
  function trySiteSpecific() {
    const host = location.hostname;
    const url = location.href;

    // Google Docs — canvas-based rendering, DOM has no content
    // Auto select-all and grab the selection
    if (host === "docs.google.com" && url.includes("/document/")) {
      // Try to get text via accessibility elements
      const accessibilityContent = document.querySelector('[role="textbox"]');
      if (accessibilityContent) {
        const text = accessibilityContent.innerText || accessibilityContent.textContent;
        if (text && text.trim().length > 10) return text.trim();
      }
      // Try contenteditable areas
      const editables = document.querySelectorAll('[contenteditable="true"]');
      for (const el of editables) {
        const text = el.innerText || el.textContent || "";
        if (text.trim().length > 10) return text.trim();
      }
      // Return special flag so popup can prompt user
      return "__NEEDS_SELECTION__";
    }

    // Google Sheets
    if (host === "docs.google.com" && url.includes("/spreadsheets/")) {
      return "__NEEDS_SELECTION__";
    }

    // Granola, Notion, and other SPA special handling
    if (host === "notes.granola.ai" || host === "www.notion.so") {
      const main = document.querySelector("main, [role='main'], article");
      if (main) return main.innerText.trim();
    }
    return null;
  }

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

  // Try special handlers first (Google Docs, Granola, Notion, etc.)
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

    // If the site needs clipboard (e.g. Google Docs canvas rendering)
    let clipboardText = "";
    if (result.content === "__NEEDS_SELECTION__") {
      try {
        clipboardText = await navigator.clipboard.readText();
      } catch (e) {
        // clipboard empty or denied
      }
      if (!clipboardText && !result.selection) {
        setStatus("Copy text first (⌘C), then hit Send.", "error");
        sendBtn.disabled = false;
        return;
      }
    }

    payload = {
      url: result.url,
      title: result.title,
      content: result.content === "__NEEDS_SELECTION__" ? "" : cleanWhitespace(result.content || ""),
      selection: cleanWhitespace(clipboardText || result.selection || ""),
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

    setStatus("Sent to OpenClaw.", "ok");
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
