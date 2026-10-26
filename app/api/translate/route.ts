// Sarvam Translate: bridges the language gap between grandparent and grandchild.
// sarvam-translate:v1 covers all 22 scheduled Indian languages plus English.

import type { SarvamAI } from "sarvamai";
import { handle, HttpError, mapLimit, readJson, sarvam } from "@/lib/server/sarvam";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const { texts, source = "en-IN", target } = await readJson<{ texts?: string[]; source?: string; target?: string }>(req);
  if (!Array.isArray(texts) || !target) throw new HttpError(400, "texts and target are required.");
  if (texts.length > 120) throw new HttpError(400, "Too many texts in one request.");
  if (source === target) return Response.json({ texts });

  const s = sarvam();
  const translated = await mapLimit(texts, 4, async (text) => {
    if (!text?.trim()) return text ?? "";
    const res = await s.text.translate({
      input: text.slice(0, 2000),
      source_language_code: source as SarvamAI.TranslateSourceLanguage,
      target_language_code: target as SarvamAI.TranslateTargetLanguage,
      model: "sarvam-translate:v1",
      mode: "formal",
    });
    return res.translated_text;
  });
  return Response.json({ texts: translated });
});
