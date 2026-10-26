// Quick speech to text (Saaras v3, REST, under 30 s per request).
// Used for the live interviewer's turns and cook-along voice commands.

import type { SarvamAI } from "sarvamai";
import { handle, HttpError, sarvam } from "@/lib/server/sarvam";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) throw new HttpError(400, "No audio received.");
  const language = String(form.get("language") || "unknown");

  const res = await sarvam().speechToText.transcribe({
    file,
    model: "saaras:v3",
    mode: "transcribe",
    language_code: language as SarvamAI.SpeechToTextLanguage,
  });
  return Response.json({ transcript: res.transcript ?? "", language: res.language_code ?? null });
});
