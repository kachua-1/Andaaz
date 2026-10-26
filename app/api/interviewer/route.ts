// The AI interviewer: asks the grandparent one gentle follow-up at a time, in their language.
// Runs on Sarvam's conversational model, which is tuned for natural, colloquial Indic dialogue.

import { languageName } from "@/lib/languages";
import { chat, handle, readJson } from "@/lib/server/sarvam";
import type { Turn } from "@/lib/types";

export const maxDuration = 60;

const MAX_QUESTIONS = 12;

export const POST = handle(async (req) => {
  const { language = "hi-IN", elderName = "Dadi", dish = "", turns = [] } = await readJson<{
    language?: string;
    elderName?: string;
    dish?: string;
    turns?: Turn[];
  }>(req);
  const lang = languageName(language);
  const asked = turns.filter((t) => t.who === "interviewer").length;

  const system = `You are the gentle interviewer inside Andaaz, an app that records family recipes from grandparents.
You are talking with ${elderName}, an elder who cooks "andaaz se" (by estimation), not from written recipes.
Speak ONLY in ${lang}, in the simple, affectionate spoken style a grandchild uses with a grandparent, always respectful. Everyday English kitchen words are fine if natural.

Ask exactly ONE short question (under 20 words). Ask what a grandchild wouldn't know to ask:
1. which dish, and for which festival or occasion it was made
2. every ingredient AND how much. When they give a fuzzy measure (mutthi, chutki, thoda sa, katori, andaaz se), ask them to describe or compare it
3. the steps, in order
4. sensory checkpoints: how they know a step is done (smell, sound, colour, texture)
5. timing and flame level
6. the story: who taught them, a memory attached to the dish
Follow up on what they just said before moving on. Never repeat a question that was already answered. Never give cooking advice yourself.

When ingredients, steps, cues and the story are covered, or after ${MAX_QUESTIONS} questions, set "done" to true and make "question" a warm thank-you in ${lang}.
Reply with JSON only: {"question": "...", "done": false}`;

  const history = turns
    .map((t) => `${t.who === "interviewer" ? "Interviewer" : elderName}: ${t.text}`)
    .join("\n");
  const user = turns.length
    ? `Dish (if known): ${dish || "not said yet"}\nQuestions asked so far: ${asked}\n\nConversation so far:\n${history}\n\nYour next single question, as JSON:`
    : `Dish (if known): ${dish || "not said yet"}\nStart the session: greet ${elderName} warmly and ask your first question, as JSON.`;

  const reply = await chat({ model: "sarvam-105b-conversations", system, user, json: true, maxTokens: 800, temperature: 0.6 });
  const parsed = safeParse(reply);
  return Response.json({
    question: parsed.question || reply.trim().slice(0, 300),
    done: Boolean(parsed.done) || asked >= MAX_QUESTIONS,
  });
});

function safeParse(text: string): { question?: string; done?: boolean } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]);
  } catch {
    return {};
  }
}
