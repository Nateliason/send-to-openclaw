const MENU_ID = "send-to-openclaw";

function cleanWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
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

function getGoogleDocId(url) {
  const match = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

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

function extractPageContent() {
  const selection = window.getSelection ? window.getSelection().toString().trim() : "";

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

async function sendPayload(tabId, tabUrl, tabTitle, selectionOverride) {
  const settings = await getSettings();
  if (!settings.webhookUrl) return;

  let payload;
  const docId = getGoogleDocId(tabUrl || "");

  if (docId) {
    const docText = await fetchGoogleDocText(tabId, docId);
    payload = {
      url: tabUrl,
      title: tabTitle || "Google Doc",
      content: docText.trim(),
      selection: "",
      message: "",
      timestamp: new Date().toISOString()
    };
  } else {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageContent
    });
    payload = {
      url: result.url,
      title: result.title,
      content: cleanWhitespace(result.content || ""),
      selection: cleanWhitespace(selectionOverride || result.selection || ""),
      message: "",
      timestamp: new Date().toISOString()
    };
  }

  await fetch(settings.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.authToken ? { Authorization: `Bearer ${settings.authToken}` } : {})
    },
    body: JSON.stringify(payload)
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Send to OpenClaw",
    contexts: ["page", "selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab || !tab.id) return;
  sendPayload(tab.id, tab.url, tab.title, info.selectionText || "").catch(() => {});
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "send-selection") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  try {
    // For Google Docs, no need for content script shenanigans
    const docId = getGoogleDocId(tab.url || "");
    if (docId) {
      const docText = await fetchGoogleDocText(tab.id, docId);
      await chrome.storage.local.set({
        capturedSelection: "",
        capturedUrl: tab.url || "",
        capturedTitle: tab.title || "",
        capturedDocContent: docText.trim()
      });
      chrome.action.openPopup();
      return;
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const sel = window.getSelection ? window.getSelection().toString().trim() : "";
        return { selection: sel, url: location.href, title: document.title || "Untitled" };
      }
    });

    await chrome.storage.local.set({
      capturedSelection: result.selection || "",
      capturedUrl: result.url || "",
      capturedTitle: result.title || "",
      capturedDocContent: ""
    });

    chrome.action.openPopup();
  } catch (e) {
    chrome.action.openPopup();
  }
});
