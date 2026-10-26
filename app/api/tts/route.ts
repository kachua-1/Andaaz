// Text to speech with Bulbul v3: the interviewer's questions and cook-along narration.

import type { SarvamAI } from "sarvamai";
import { canSpeak, languageName } from "@/lib/languages";
import { handle, HttpError, readJson, sarvam } from "@/lib/server/sarvam";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const { text, language, speaker, pace } = await readJson<{
    text?: string;
    language?: string;
    speaker?: string;
    pace?: number;
  }>(req);
  if (!text?.trim()) throw new HttpError(400, "Nothing to say.");
  if (!language || !canSpeak(language)) {
    throw new HttpError(400, `Bulbul v3 doesn't have a ${languageName(language ?? "")} voice yet.`);
  }

  const res = await sarvam().textToSpeech.convert({
    text: text.slice(0, 2500),
    language_code: language as SarvamAI.TextToSpeechLanguage,
    model: "bulbul:v3",
    speaker: (speaker || "priya") as SarvamAI.TextToSpeechSpeaker,
    pace: Math.min(Math.max(pace ?? 1, 0.5), 2),
  });
  if (!res.audios[0]) throw new HttpError(502, "Bulbul returned no audio.");
  const audio = Buffer.from(res.audios[0], "base64");
  return new Response(audio, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
});
