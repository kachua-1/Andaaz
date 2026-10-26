// Cook-along questions ("how do I know it's done?"). Answers come only from the
// grandparent's own recordings, with a pointer to the line so the app can play her saying it.

import { languageName } from "@/lib/languages";
import { chat, handle, HttpError, parseModelJson, readJson } from "@/lib/server/sarvam";
import type { Segment } from "@/lib/types";

export const maxDuration = 60;

interface AskBody {
  question?: string;
  language?: string;
  elderName?: string;
  title?: string;
  currentStep?: number;
  steps?: { instruction: string; sensoryCue: string }[];
  ingredients?: string[];
  segments?: Segment[];
  elderSpeaker?: string | null;
  diaryText?: string | null;
}

export const POST = handle(async (req) => {
  const b = await readJson<AskBody>(req);
  if (!b.question?.trim()) throw new HttpError(400, "No question heard.");
  const elder = b.elderName || "Dadi";
  const lang = languageName(b.language || "en-IN");

  const transcript = (b.segments ?? [])
    .map((s, i) => `[${i}] ${s.speaker === b.elderSpeaker ? elder : `S${s.speaker}`}: ${s.text}`)
    .join("\n")
    .slice(0, 50000);
  const steps = (b.steps ?? []).map((s, i) => `${i + 1}. ${s.instruction}${s.sensoryCue ? ` (cue: ${s.sensoryCue})` : ""}`).join("\n");

  const system = `You help someone cook ${b.title || "a family recipe"} along with ${elder}'s recorded recipe.
Answer ONLY from ${elder}'s recordings and the recipe derived from them, below. If they don't cover the question, say ${elder} didn't mention it and suggest asking ${elder}. Never add outside cooking advice.
Reply in ${lang}, warm and practical, under 50 words.
Also classify the intent: "next" (go to next step), "prev" (go back), "repeat" (say this step again), or "answer" (a question).
"segment" is the index of the single transcript line that best supports the answer, or null.
Reply with JSON only: {"intent":"answer","answer":"","segment":null}`;

  const user = `Recipe steps:\n${steps}\n\nIngredients: ${(b.ingredients ?? []).join("; ")}\n\n${
    transcript ? `${elder}'s recording, line by line:\n${transcript}` : `Diary text:\n${(b.diaryText ?? "").slice(0, 20000)}`
  }\n\nThe cook is on step ${(b.currentStep ?? 0) + 1}. They said: "${b.question.trim()}"`;

  const out = parseModelJson<{ intent?: string; answer?: string; segment?: number | null }>(
    await chat({ system, user, json: true, maxTokens: 900 }),
  );
  const intent = ["next", "prev", "repeat"].includes(out.intent ?? "") ? out.intent : "answer";
  const segment = Number.isInteger(out.segment) && (out.segment as number) < (b.segments?.length ?? 0) ? out.segment : null;
  return Response.json({ intent, answer: out.answer ?? "", segment });
});
