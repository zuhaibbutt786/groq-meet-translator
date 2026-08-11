(function () {
  if (window.__GMT_INJECTED__) return;
  window.__GMT_INJECTED__ = true;

  const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  let controlStream = null;
  let realMicStream = null;
  let audioCtx = null;
  let destination = null;
  let micGain = null;
  let ttsGain = null;
  let micSource = null;
  let graphReady = false;
  let mode = "translate_only";

  function ensureGraph(realStream) {
    if (graphReady && audioCtx) return;
    audioCtx = new AudioContext({ sampleRate: 48000 });
    destination = audioCtx.createMediaStreamDestination();
    micGain = audioCtx.createGain();
    ttsGain = audioCtx.createGain();
    micGain.gain.value = mode === "translate_only" ? 0 : 1;
    ttsGain.gain.value = 1;
    micSource = audioCtx.createMediaStreamSource(realStream);
    micSource.connect(micGain).connect(destination);
    ttsGain.connect(destination);
    graphReady = true;
  }

  function applyMode() {
    if (!micGain || !audioCtx) return;
    if (mode === "translate_only") {
      micGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
    } else if (mode === "mix") {
      micGain.gain.setTargetAtTime(0.7, audioCtx.currentTime, 0.02);
    } else {
      micGain.gain.setTargetAtTime(1, audioCtx.currentTime, 0.02);
    }
  }

  function swapTracksToDestination() {
    if (!controlStream || !destination) return;
    const old = controlStream.getAudioTracks().slice();
    old.forEach(function (t) { controlStream.removeTrack(t); });
    destination.stream.getAudioTracks().forEach(function (t) {
      controlStream.addTrack(t);
    });
  }

  navigator.mediaDevices.getUserMedia = async function (constraints) {
    const wantsAudio =
      constraints &&
      (constraints.audio === true ||
        (typeof constraints.audio === "object" && constraints.audio !== null));

    if (!wantsAudio) {
      return origGUM(constraints);
    }

    const real = await origGUM(constraints);
    realMicStream = real;

    controlStream = new MediaStream();
    real.getAudioTracks().forEach(function (t) {
      controlStream.addTrack(t.clone());
    });
    real.getVideoTracks().forEach(function (t) {
      controlStream.addTrack(t);
    });

    try {
      ensureGraph(real);
      applyMode();
      setTimeout(function () {
        if (mode !== "original") {
          swapTracksToDestination();
        }
      }, 400);
    } catch (e) {
      console.warn("[GMT] audio graph failed", e);
    }

    window.__GMT_STATE__ = {
      ready: true,
      mode: mode,
      hasControl: !!controlStream
    };

    return controlStream;
  };

  window.addEventListener("gmt-set-mode", function (ev) {
    mode = (ev.detail && ev.detail.mode) || "translate_only";
    applyMode();
    if (mode === "original") {
      if (controlStream && realMicStream) {
        controlStream.getAudioTracks().slice().forEach(function (t) {
          controlStream.removeTrack(t);
        });
        realMicStream.getAudioTracks().forEach(function (t) {
          controlStream.addTrack(t.clone());
        });
      }
    } else {
      swapTracksToDestination();
    }
  });

  window.addEventListener("gmt-play-tts-buffer", async function (ev) {
    try {
      const detail = ev.detail || {};
      const arrayBuffer = detail.arrayBuffer;
      if (!arrayBuffer || !audioCtx || !ttsGain) return;

      if (audioCtx.state === "suspended") await audioCtx.resume();

      var audioBuffer;
      try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      } catch (err) {
        console.warn("[GMT] decode failed", err);
        return;
      }

      if (micGain && mode === "mix") {
        micGain.gain.setTargetAtTime(0.15, audioCtx.currentTime, 0.02);
      }

      var src = audioCtx.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(ttsGain);
      src.start();
      src.onended = function () {
        if (micGain && mode === "mix") {
          micGain.gain.setTargetAtTime(0.7, audioCtx.currentTime, 0.05);
        }
      };
    } catch (e) {
      console.warn("[GMT] play tts error", e);
    }
  });

  window.addEventListener("gmt-speak-local", function (ev) {
    var text = ev.detail && ev.detail.text;
    var lang = (ev.detail && ev.detail.lang) || "en";
    if (!text || !window.speechSynthesis) return;
    var u = new SpeechSynthesisUtterance(text);
    u.lang = langMap(lang);
    u.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });

  function langMap(code) {
    var m = {
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
    return m[code] || code;
  }

  console.log("[GMT] injector ready");
})();
