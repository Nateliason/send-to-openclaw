const MENU_ID = "send-to-clawdbot";

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

async function sendPayload(tabId, selectionOverride) {
  const settings = await getSettings();
  if (!settings.webhookUrl) {
    return;
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractPageContent
  });

  const payload = {
    url: result.url,
    title: result.title,
    content: cleanWhitespace(result.content || ""),
    selection: cleanWhitespace(selectionOverride || result.selection || ""),
    message: "",
    timestamp: new Date().toISOString()
  };

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
    title: "Send to Clawdbot",
    contexts: ["page", "selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab || !tab.id) {
    return;
  }
  sendPayload(tab.id, info.selectionText || "").catch(() => {});
});
