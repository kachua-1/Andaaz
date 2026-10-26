# Andaaz · अंदाज़

**Grandparents' recipes, taught back in their own voice.**

Andaaz is a living family cookbook. It learns a recipe from a grandparent speaking naturally, in their own language, then teaches it to the next generation step by step, with the grandparent's own voice guiding each step.

Grandparents rarely cook from written recipes. They cook *andaaz se*, by estimation: *ek mutthi besan, thoda sa hing, jab tak tel chhodne na lage*. Andaaz keeps the three things a plain transcript loses: approximate measures, sensory cues, and the story behind each dish.

## What the prototype does

| Stage | What happens | Sarvam model |
| --- | --- | --- |
| **Capture** | Dadi just talks. A live AI interviewer asks one gentle follow-up at a time, out loud, in her language ("kitna namak?", "kaise pata chalta hai ki ho gaya?"). Or upload an existing recording or video. | Saaras v3 (speech to text), Sarvam-105B Conversations (interviewer), Bulbul v3 (speaks the questions) |
| **Speakers and timestamps** | The whole session goes through the **Batch** speech-to-text API, the only one that returns speaker-separated segments with timestamps. That's how Andaaz tells Dadi's voice from the grandchild's and cuts her audio clips. | Saaras v3 Batch API (diarization) |
| **Decode (the Andaaz engine)** | Fuzzy quantities become ranges marked as estimates (*ek mutthi* → ≈ 30–40 g). Each step gets a sensory checkpoint, regional names get common names and local substitutes, and the family story is kept. Missing details become "Ask Dadi next time" questions. | Sarvam-105B |
| **Katori calibration** | The family measures Dadi's actual katori once (photo plus millilitres). "Ek katori" then means *her* katori. | — |
| **Translate** | Grandchildren read and hear the recipe in their own language: 22 Indian languages plus English. | Sarvam Translate (`sarvam-translate:v1`) |
| **Cook-along** | Hands-free, step by step: Dadi's original clip plays, then narration in your language, with timers from her cues. Voice commands: "agla step", "repeat", "how do I know it's done?". Answers come **only** from her recordings. | Saaras v3, Sarvam-105B, Bulbul v3 |
| **Heritage** | Family recipe tree, festival calendar ("Dadi's Holi gujiya"), printable family cookbook, and digitising old recipe diaries (including handwriting). | Sarvam Vision (Document Intelligence `digitise`) |

## Tech stack

- **Next.js 16 (App Router) + TypeScript.** Runs on Vercel with zero config.
- **Server routes in `app/api/*`** call Sarvam through the official [`sarvamai`](https://www.npmjs.com/package/sarvamai) SDK. The API key stays on the server and never reaches the browser.
- **Browser storage (IndexedDB)** keeps recipes and recordings on the device. No database to set up.
- **Web Audio and MediaRecorder** for recording, splitting audio into chunks under 30 seconds for the REST STT endpoint, and frame-accurate clip playback.
- No UI framework: plain CSS with light and dark themes and a print stylesheet.

```
app/
  api/stt          quick STT for interview turns and voice commands (Saaras v3 REST)
  api/batch        batch STT with diarization and timestamps (Saaras v3 Batch)
  api/interviewer  the follow-up question generator (Sarvam-105B Conversations)
  api/decode       the Andaaz engine (Sarvam-105B)
  api/translate    Sarvam Translate
  api/tts          Bulbul v3
  api/ask          cook-along Q&A grounded in the recording (Sarvam-105B)
  api/digitise     Sarvam Vision for recipe diaries
  capture/         live interview, upload, diary page
  recipe/[id]/     recipe view, and /cook for the cook-along
  cookbook/        printable family cookbook
  settings/        family, languages, katori calibration, access code
lib/               shared types, languages, client helpers (audio, storage, pipeline)
```

## Run it locally

You need Node 20+ and a Sarvam API key from [dashboard.sarvam.ai](https://dashboard.sarvam.ai).

```bash
npm install
cp .env.example .env.local   # then put your key in SARVAM_API_KEY
npm run dev
```

Open http://localhost:3000. To look around without spending credits, use **Try a sample recipe** on the home page.

## Deploy to Vercel

1. Push this repo to GitHub.
2. On [vercel.com/new](https://vercel.com/new), import the repo. Vercel detects Next.js automatically.
3. Under **Environment Variables**, add:
   - `SARVAM_API_KEY`: your Sarvam key (required)
   - `ACCESS_CODE`: optional. If set, the app asks for this code (in Settings) before calling Sarvam, so strangers with your URL can't spend your credits.
4. Deploy. Every push to `main` redeploys.

## Prototype limits (honest notes)

- **Recordings over ~4 MB can't be uploaded.** Sarvam's batch storage doesn't accept direct uploads from browsers, so files go through the server, and Vercel caps request bodies at ~4.5 MB. That's about 15 minutes of in-app recording, or about 4 minutes of a 128 kbps MP3.
- **Recipes live in the browser that recorded them.** Sharing across the family needs a backend (for example Vercel Blob plus Postgres) as a next step.
- **Diarization is best when voices differ.** If it mixes up who is speaking, use "Which voice is Dadi?" under the transcript to fix the clips.
- **Handwriting.** Sarvam Vision reads handwritten pages, but quality varies by hand. The app shows what it read and lets you correct it before decoding. Test it on your own diaries before promising this.
- **Voice commands are push-to-talk** (tap the mic or press Space), not always-listening.
- Text-to-speech covers Bulbul v3's 11 languages. Other languages are shown as text.
