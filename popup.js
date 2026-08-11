const apiKeyEl = document.getElementById("apiKey");
const sourceLangEl = document.getElementById("sourceLang");
const targetLangEl = document.getElementById("targetLang");
const micModeEl = document.getElementById("micMode");
const enabledEl = document.getElementById("enabled");
const keyStatus = document.getElementById("keyStatus");
const saveStatus = document.getElementById("saveStatus");

async function load() {
  const data = await chrome.storage.local.get([
    "groqApiKey",
    "sourceLang",
    "targetLang",
    "micMode",
    "enabled"
  ]);
  if (data.groqApiKey) {
    apiKeyEl.value = data.groqApiKey;
    keyStatus.textContent = "Key loaded";
    keyStatus.className = "hint ok";
  }
  if (data.sourceLang) sourceLangEl.value = data.sourceLang;
  if (data.targetLang) targetLangEl.value = data.targetLang;
  if (data.micMode) micModeEl.value = data.micMode;
  enabledEl.checked = !!data.enabled;
}

document.getElementById("saveKey").addEventListener("click", async () => {
  const key = apiKeyEl.value.trim();
  if (!key) {
    keyStatus.textContent = "Enter a key";
    keyStatus.className = "hint err";
    return;
  }
  await chrome.storage.local.set({ groqApiKey: key });
  keyStatus.textContent = "Key saved";
  keyStatus.className = "hint ok";
});

document.getElementById("saveAll").addEventListener("click", async () => {
  const key = apiKeyEl.value.trim();
  await chrome.storage.local.set({
    groqApiKey: key || undefined,
    sourceLang: sourceLangEl.value,
    targetLang: targetLangEl.value,
    micMode: micModeEl.value,
    enabled: enabledEl.checked
  });
  saveStatus.textContent = "Saved. Reload Meet tab if already open.";
  saveStatus.className = "hint ok";

  const tabs = await chrome.tabs.query({ url: "https://meet.google.com/*" });
  for (const tab of tabs) {
    try {
      chrome.tabs.sendMessage(tab.id, { type: "SETTINGS_UPDATED" });
    } catch (_) {}
  }
});

enabledEl.addEventListener("change", async () => {
  await chrome.storage.local.set({ enabled: enabledEl.checked });
  const tabs = await chrome.tabs.query({ url: "https://meet.google.com/*" });
  for (const tab of tabs) {
    try {
      chrome.tabs.sendMessage(tab.id, {
        type: "SETTINGS_UPDATED",
        enabled: enabledEl.checked
      });
    } catch (_) {}
  }
});

load();
