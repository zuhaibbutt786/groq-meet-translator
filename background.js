chrome.runtime.onInstalled.addListener(() => {
  console.log("Groq Meet Translator installed");
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_SETTINGS") {
    chrome.storage.local.get(
      ["groqApiKey", "sourceLang", "targetLang", "enabled", "micMode"],
      (data) => sendResponse(data)
    );
    return true;
  }
});
