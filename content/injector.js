(function () {
  if (window.__GMT_INJECTED__) return;
  window.__GMT_INJECTED__ = true;

  var origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  var controlStream = null;
  var realMicStream = null;
  var audioCtx = null;
  var destination = null;
  var micGain = null;
  var ttsGain = null;
  var micSource = null;
  var graphReady = false;
  var mode = "translate_only";

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
    controlStream.getAudioTracks().slice().forEach(function (t) {
      controlStream.removeTrack(t);
    });
    destination.stream.getAudioTracks().forEach(function (t) {
      controlStream.addTrack(t);
    });
  }

  navigator.mediaDevices.getUserMedia = async function (constraints) {
    var wantsAudio =
      constraints &&
      (constraints.audio === true ||
        (typeof constraints.audio === "object" && constraints.audio !== null));

    if (!wantsAudio) {
      return origGUM(constraints);
    }

    var real = await origGUM(constraints);
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

  async function playTtsBuffer(arrayBuffer) {
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
  }

  // Bridge from isolated content script (CustomEvent does NOT cross worlds)
  window.addEventListener("message", function (ev) {
    var data = ev.data;
    if (!data || data.source !== "gmt") return;

    if (data.type === "set-mode") {
      mode = data.mode || "translate_only";
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
    }

    if (data.type === "play-tts" && data.buffer) {
      playTtsBuffer(data.buffer);
    }
  });

  console.log("[GMT] injector ready");
})();
