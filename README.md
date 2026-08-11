# Groq Meet Translator

Live speech translator for **Google Meet only**.

Speak in your language → others hear / see the translation.

Uses **Groq only**:
- **STT:** `whisper-large-v3-turbo` (fast, multilingual)
- **Translate:** `llama-3.1-8b-instant` (fast, cheap)
- **TTS into Meet stream:** Groq Orpheus when target is **English or Arabic**
- **Local playback:** browser Speech Synthesis (all languages)

## How the virtual mic works (Audio Cable style)

No extra software. The extension **hooks getUserMedia** on Meet and replaces the mic track with a Web Audio mix:

| Mode | What Meet sends |
|------|------------------|
| **Translation only** | Translated speech (EN/AR via Groq TTS) |
| **Mix** | Your voice + translation |
| **Original** | Your real mic (captions still shown) |

**Tip:** After enabling, **mute then unmute** your mic in Meet so it re-requests the microphone and picks up the hook.

## Install (2 minutes)

1. Get a free key: https://console.groq.com/keys
2. Download this repo (Code → Download ZIP) and unzip
3. Chrome → `chrome://extensions` → Developer mode ON
4. **Load unpacked** → select this folder
5. Open the extension popup → paste API key → choose languages → Save
6. Open https://meet.google.com and join a call
7. Turn **Translation ON** in the floating panel (bottom-right)
8. Mute/unmute mic once in Meet, then speak

## Recommended settings

- **You speak:** Auto-detect or Urdu / Hindi / etc.
- **They hear:** English (best Meet injection via Groq TTS)
- **Mode:** Translation only

For German/Spanish/etc. as target: you still get **live captions + local voice**. Full audio injection into Meet is strongest for **English** (and Arabic) because Groq TTS currently supports those languages.

## Privacy

- API key stored only in `chrome.storage.local`
- Audio chunks sent only to `api.groq.com`
- No other servers

## Limits (honest)

- Works on **Google Meet in Chrome** only
- Not WhatsApp / Zoom desktop apps
- Latency about 2 to 4 seconds per phrase
- Google may change Meet internals; if mic hook fails, mute/unmute or reload the tab

## License

MIT
