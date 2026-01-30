const displayNameInput = document.getElementById("displayName");
const webhookInput = document.getElementById("webhookUrl");
const tokenInput = document.getElementById("authToken");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

function setStatus(message) {
  statusEl.textContent = message;
}

function loadSettings() {
  chrome.storage.sync.get(["webhookUrl", "authToken", "displayName"], (data) => {
    webhookInput.value = data.webhookUrl || "";
    tokenInput.value = data.authToken || "";
    displayNameInput.value = data.displayName || "";

    const name = data.displayName || "OpenClaw";
    const heading = document.getElementById("options-title");
    if (heading) heading.textContent = `Send to ${name}`;
    document.title = `Send to ${name} Options`;
  });
}

function saveSettings() {
  const webhookUrl = webhookInput.value.trim();
  const authToken = tokenInput.value.trim();
  const displayName = displayNameInput.value.trim();

  chrome.storage.sync.set({ webhookUrl, authToken, displayName }, () => {
    const name = displayName || "OpenClaw";
    const heading = document.getElementById("options-title");
    if (heading) heading.textContent = `Send to ${name}`;
    document.title = `Send to ${name} Options`;

    setStatus("Saved.");
    setTimeout(() => setStatus(""), 2000);
  });
}

saveBtn.addEventListener("click", saveSettings);

document.addEventListener("DOMContentLoaded", loadSettings);
loadSettings();
