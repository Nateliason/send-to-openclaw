const webhookInput = document.getElementById("webhookUrl");
const tokenInput = document.getElementById("authToken");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

function setStatus(message) {
  statusEl.textContent = message;
}

function loadSettings() {
  chrome.storage.sync.get(["webhookUrl", "authToken"], (data) => {
    webhookInput.value = data.webhookUrl || "";
    tokenInput.value = data.authToken || "";
  });
}

function saveSettings() {
  const webhookUrl = webhookInput.value.trim();
  const authToken = tokenInput.value.trim();

  chrome.storage.sync.set({ webhookUrl, authToken }, () => {
    setStatus("Saved.");
    setTimeout(() => setStatus(""), 2000);
  });
}

saveBtn.addEventListener("click", saveSettings);

document.addEventListener("DOMContentLoaded", loadSettings);
loadSettings();
