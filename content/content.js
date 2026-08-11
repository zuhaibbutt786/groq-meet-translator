const GROQ_STT = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_CHAT = "https://api.groq.com/openai/v1/chat/completions";
const STT_MODEL = "whisper-large-v3-turbo";
const TRANSLATE_MODEL = "llama-3.1-8b-instant";

let settings = {
  groqApiKey: "",
  sourceLang: "auto",
  targetLang: "en",
  micMode: "translate_only",
  enabled: false
};

let mediaRecorder = null;
let recordStream = null;
let chunks = [];
let recording = false;
let processing = false;
let panel = null;
let statusEl = null;
let bodyEl = null;
let silenceTimer = null;

const LANG_NAMES = {
  en: "English",
  de: "German",
  es: "Spanish",
  fr: "French",
  ur: "Urdu",
  hi: "Hindi",
  ar: "Arabic",
  pt: "Portuguese",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  tr: "Turkish",
  ru: "Russian",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  auto: "Auto"
};

const LANG_BCP = {
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  ur: "ur-PK",
  hi: "hi-IN",
  ar: "ar-SA",
  pt: "pt-BR",
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
  tr: "tr-TR",
  ru: "ru-RU",
  it: "it-IT",
  nl: "nl-NL",
  pl: "pl-PL"
};

function sendToInjector(payload, transfer) {
  try {
    if (transfer) {
      window.postMessage(payload, "*", transfer);
    } else {
      window.postMessage(payload, "*");
    }
  } catch (e) {
    console.warn("[GMT] postMessage failed", e);
  }
}

async function loadSettings() {
  const data = await chrome.storage.local.get([
    "groqApiKey",
    "sourceLang",
    "targetLang",
    "micMode",
    "enabled"
  ]);
  settings = Object.assign({}, settings, data);
  sendToInjector({
    source: "gmt",
    type: "set-mode",
    mode: settings.micMode || "translate_only"
  });
  updatePanel();
}

function createPanel() {
  if (document.getElementById("gmt-panel")) return;
  panel = document.createElement("div");
  panel.id = "gmt-panel";
  panel.innerHTML =
    '<header><span><span class="dot" id="gmt-dot"></span>Groq Meet Translator</span>' +
    '<button id="gmt-toggle">OFF</button></header>' +
    '<div id="gmt-body"></div>' +
    '<div id="gmt-status">Idle - set API key in extension popup</div>';
  document.documentElement.appendChild(panel);
  bodyEl = document.getElementById("gmt-body");
  statusEl = document.getElementById("gmt-status");
  document.getElementById("gmt-toggle").addEventListener("click", async function () {
    settings.enabled = !settings.enabled;
    await chrome.storage.local.set({ enabled: settings.enabled });
    updatePanel();
    if (settings.enabled) startCapture();
    else stopCapture();
  });
}

function updatePanel() {
  if (!panel) return;
  var btn = document.getElementById("gmt-toggle");
  var dot = document.getElementById("gmt-dot");
  if (settings.enabled) {
    btn.textContent = "ON";
    btn.classList.add("on");
    if (dot) dot.classList.add("on");
  } else {
    btn.textContent = "OFF";
    btn.classList.remove("on");
    if (dot) dot.classList.remove("on");
  }
  if (statusEl && !settings.groqApiKey) {
    statusEl.textContent = "Set Groq API key in the extension popup";
  }
}

function addLine(src, tgt) {
  if (!bodyEl) return;
  var div = document.createElement("div");
  div.className = "line";
  div.innerHTML =
    '<div class="src">' +
    escapeHtml(src) +
    '</div><div class="tgt">' +
    escapeHtml(tgt) +
    "</div>";
  bodyEl.prepend(div);
  while (bodyEl.children.length > 12) bodyEl.removeChild(bodyEl.lastChild);
}

function escapeHtml(s) {
  var d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function setStatus(t) {
  if (statusEl) statusEl.textContent = t;
}

async function startCapture() {
  if (recording || !settings.enabled) return;
  if (!settings.groqApiKey) {
    setStatus("Missing API key");
    return;
  }
  try {
    recordStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    chunks = [];
    var mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    mediaRecorder = new MediaRecorder(recordStream, { mimeType: mime });
    mediaRecorder.ondataavailable = function (e) {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.onstop = async function () {
      if (chunks.length === 0) {
        if (settings.enabled) scheduleChunk();
        return;
      }
      var blob = new Blob(chunks, { type: mime });
      chunks = [];
      await processUtterance(blob);
      if (settings.enabled) scheduleChunk();
    };
    recording = true;
    setStatus("Listening... speak clearly");
    scheduleChunk();
  } catch (e) {
    console.error(e);
    setStatus("Mic permission denied");
  }
}

function scheduleChunk() {
  if (!settings.enabled || !mediaRecorder) return;
  if (mediaRecorder.state === "inactive") {
    chunks = [];
    mediaRecorder.start();
  }
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(function () {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }, 2500);
}

function stopCapture() {
  recording = false;
  clearTimeout(silenceTimer);
  if (mediaRecorder && mediaRecorder.state === "recording") {
    try {
      mediaRecorder.stop();
    } catch (e) {}
  }
  if (recordStream) {
    recordStream.getTracks().forEach(function (t) {
      t.stop();
    });
    recordStream = null;
  }
  mediaRecorder = null;
  setStatus("Off");
}

async function processUtterance(blob) {
  if (processing) return;
  if (blob.size < 2000) return;
  processing = true;
  setStatus("Transcribing...");
  try {
    var text = await transcribe(blob);
    if (!text || text.trim().length < 2) {
      setStatus("Listening...");
      processing = false;
      return;
    }
    setStatus("Translating...");
    var translated = await translate(text.trim());
    addLine(text.trim(), translated);
    setStatus("Speaking translation...");
    await speakTranslation(translated);
    setStatus("Listening...");
  } catch (e) {
    console.error(e);
    setStatus("Error: " + (e.message || "failed").slice(0, 60));
  } finally {
    processing = false;
  }
}

async function transcribe(blob) {
  var fd = new FormData();
  fd.append("file", blob, "chunk.webm");
  fd.append("model", STT_MODEL);
  fd.append("response_format", "json");
  fd.append("temperature", "0");
  if (settings.sourceLang && settings.sourceLang !== "auto") {
    fd.append("language", settings.sourceLang);
  }
  var res = await fetch(GROQ_STT, {
    method: "POST",
    headers: { Authorization: "Bearer " + settings.groqApiKey },
    body: fd
  });
  if (!res.ok) {
    var t = await res.text();
    throw new Error("STT " + res.status + " " + t.slice(0, 120));
  }
  var data = await res.json();
  return (data.text || "").trim();
}

async function translate(text) {
  var tgt = LANG_NAMES[settings.targetLang] || settings.targetLang;
  var res = await fetch(GROQ_CHAT, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + settings.groqApiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: TRANSLATE_MODEL,
      temperature: 0.1,
      max_tokens: 256,
      messages: [
        {
          role: "system",
          content:
            "You are a real-time interpreter. Translate the user message into " +
            tgt +
            " only. Output ONLY the translation, no quotes, no explanation. Keep meaning natural and short for speech."
        },
        { role: "user", content: text }
      ]
    })
  });
  if (!res.ok) {
    var t = await res.text();
    throw new Error("Translate " + res.status + " " + t.slice(0, 120));
  }
  var data = await res.json();
  var out =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content
      ? data.choices[0].message.content.trim()
      : "";
  return out || text;
}

function speakLocal(text, lang) {
  if (!window.speechSynthesis || !text) return;
  var u = new SpeechSynthesisUtterance(text);
  u.lang = LANG_BCP[lang] || lang || "en-US";
  u.rate = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

async function speakTranslation(text) {
  var lang = settings.targetLang || "en";

  // Always play locally for you
  speakLocal(text, lang);

  // Inject into Meet mic stream via MAIN-world injector (EN/AR via Groq TTS)
  if (lang === "en" || lang === "ar") {
    try {
      var buf = await groqTTS(text, lang);
      if (buf) {
        sendToInjector(
          { source: "gmt", type: "play-tts", buffer: buf },
          [buf]
        );
      }
    } catch (e) {
      console.warn("Groq TTS inject failed", e);
    }
  } else {
    setStatus("Captions + local voice (Meet inject best for EN target)");
  }
}

async function groqTTS(text, lang) {
  var model =
    lang === "ar"
      ? "canopylabs/orpheus-arabic-saudi"
      : "canopylabs/orpheus-v1-english";
  var voice = lang === "ar" ? "fahad" : "troy";
  var res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + settings.groqApiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model,
      input: text,
      voice: voice,
      response_format: "wav"
    })
  });
  if (!res.ok) {
    var t = await res.text();
    throw new Error("TTS " + res.status + " " + t.slice(0, 80));
  }
  return await res.arrayBuffer();
}

chrome.runtime.onMessage.addListener(function (msg) {
  if (msg.type === "SETTINGS_UPDATED") {
    loadSettings().then(function () {
      if (settings.enabled) startCapture();
      else stopCapture();
    });
  }
});

createPanel();
loadSettings().then(function () {
  if (settings.enabled) startCapture();
});

console.log("[GMT] content script ready");
