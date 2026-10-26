// The Andaaz engine: turns a grandparent's diarized, timestamped transcript (or a digitised
// diary page) into a structured recipe: fuzzy measures become marked ranges, every step gets
// the sensory checkpoint the elder described and a pointer back to the audio, and the story
// is kept.
//
// Two rules are enforced in code rather than trusted to the model:
//  - katori measures are converted here, using the family's measured katori and a density table;
//  - a cue is kept only if it quotes words the elder actually said.

import { languageName } from "@/lib/languages";
import { chat, handle, HttpError, parseModelJson, readJson } from "@/lib/server/sarvam";
import type { CueSense, Ingredient, Segment, Step } from "@/lib/types";

export const maxDuration = 120;

interface DecodeBody {
  source: "interview" | "recording" | "diary";
  language: string;
  elderName?: string;
  elderSpeaker?: string | null;
  segments?: Segment[];
  text?: string;
  katoriMl?: number;
  learnerCity?: string;
  dishHint?: string;
}

const SENSES: CueSense[] = ["sight", "smell", "sound", "touch", "taste", "time"];

export const POST = handle(async (req) => {
  const body = await readJson<DecodeBody>(req);
  const elder = body.elderName?.trim() || "Dadi";
  const katoriMl = body.katoriMl && body.katoriMl > 20 ? Math.round(body.katoriMl) : 150;
  const city = body.learnerCity?.trim() || "a big city in India or abroad";

  let sourceText: string;
  if (body.source === "diary") {
    if (!body.text?.trim()) throw new HttpError(400, "No diary text to decode.");
    sourceText = `A page from ${elder}'s handwritten recipe diary, digitised by OCR (may contain recognition errors):\n\n${body.text.slice(0, 40000)}`;
  } else {
    const segments = body.segments ?? [];
    if (!segments.length) throw new HttpError(400, "No transcript to decode.");
    sourceText = `Transcript of a recording with ${elder}. Each line: [index] speaker, time, words. ${
      body.elderSpeaker != null ? `Speaker ${body.elderSpeaker} is most likely ${elder}.` : ""
    }\n\n${segments
      .map((s, i) => `[${i}] S${s.speaker} ${s.start.toFixed(1)}-${s.end.toFixed(1)}s: ${s.text}`)
      .join("\n")
      .slice(0, 60000)}`;
  }

  const system = `You are the Andaaz engine. You turn a grandparent's spoken or handwritten recipe into a structured recipe that a 22-year-old can follow, without losing the grandparent's knowledge: approximate measures, sensory cues and the story behind the dish.
The elder is ${elder}. The source is in ${languageName(body.language)} (it may mix languages).

Use ONLY what the source says. Never invent ingredients, steps, cues or stories. Anything important that is missing goes into "missing" as a short question to ask ${elder}.

INGREDIENTS
- name: common English name. original: the word the elder used, in the source script. quantityOriginal: the elder's own words for the amount.
- If the amount is in katoris, set "katoris" to how many (दो कटोरी = 2, आधी कटोरी = 0.5, डेढ़ = 1.5, ढाई = 2.5, सवा = 1.25) and leave min/max null; the app converts it with this family's measured katori.
- Other household measures become a range with isEstimate true: ek mutthi (fistful) of flour about 30-40 g, of rice, dal or dry fruits about 40-50 g; a chutki (pinch) of salt about 0.3-0.6 g; thoda sa of a spice about 0.5-1 tsp; chammach about 1 tsp, bada chammach about 1 tbsp; a glass about 200-250 ml.
- Only amounts stated in standard units (grams, ml) are isEstimate false, with min equal to max. No amount given: min and max null, unit "".
- substitutes: 1-2 things the learner could actually buy in ${city}. note: optional short tip in plain English, never arithmetic.

SENSORY CUES
- "cues" lists every checkpoint the elder describes for knowing something is ready or right, by colour, smell, sound, texture, taste or a test. quote is copied word for word from the source, in the original script; cue is its meaning in plain English.
- Cues ARE phrases like: "जब तक रंग हल्का गुलाबी ना हो जाए" (until it turns light pink), "खुशबू आने लगे" (until it smells fragrant), "एक टुकड़ा डालो तो धीरे धीरे ऊपर आए" (a piece of dough rises slowly: the oil is ready), "जब तक तेल छोड़ने न लगे" (until the oil separates).
- Cues are NOT plain instructions ("फिर चीनी मिलाओ"), amounts, or anything you infer from general cooking knowledge. If the elder gave no cue, the list can be empty.

STEPS
- instruction: short, simple English imperative. originalQuote: the elder's exact words for that step (max 25 words, source script).
- cue: the index in "cues" of the checkpoint for this step, or null if the elder gave none for it (then add a question to "missing").
- timerSeconds only when the elder states or clearly implies a duration (use the lower end of a range); otherwise null.
- segments: indices of the transcript lines where the elder explains that step (used to cut her audio clip). storySegments: indices where she tells the story. Use [] for diary pages.

STORY
- story: 2-4 warm sentences in English, faithful to what was said. storyQuote: one short line in the elder's own words. festival and taughtBy only if mentioned, else null. servings only if mentioned, else "".

Reply with JSON only, exactly this shape:
{"title":"","titleOriginal":"","summary":"","festival":null,"taughtBy":null,"story":"","storyQuote":"","storySegments":[],"servings":"","ingredients":[{"name":"","original":"","quantityOriginal":"","katoris":null,"min":null,"max":null,"unit":"","isEstimate":true,"substitutes":[],"note":""}],"cues":[{"quote":"","cue":"","sense":"sight"}],"steps":[{"instruction":"","originalQuote":"","cue":null,"timerSeconds":null,"segments":[]}],"tips":[],"missing":[]}`;

  const user = `${body.dishHint ? `The family says this dish is: ${body.dishHint}\n\n` : ""}${sourceText}\n\nDecode this into the Andaaz recipe JSON.`;
  const raw = parseModelJson<Record<string, unknown>>(
    await chat({ system, user, json: true, maxTokens: 7000, temperature: 0.2 }),
  );
  const source = body.source === "diary" ? (body.text ?? "") : (body.segments ?? []).map((s) => s.text).join(" ");
  return Response.json(normalise(raw, { segmentCount: body.segments?.length ?? 0, source, katoriMl }));
});

// Grams per ml for common ingredients measured by katori; liquids stay in ml. Order matters.
const DENSITY: [RegExp, number | "liquid"][] = [
  [/milk|water|oil|curd|yogh?urt|buttermilk|doodh|paani|pani|dahi|chaas|दूध|पानी|तेल|दही|छाछ/i, "liquid"],
  [/ghee|butter|makhan|घी|मक्खन/i, 0.9],
  [/jaggery|gu?r\b|गुड़/i, 0.9],
  [/sugar|boora|cheeni|chini|shakkar|चीनी|शक्कर|बूरा/i, 0.85],
  [/besan|gram flour|बेसन/i, 0.47],
  [/sooji|suji|semolina|rava|सूजी|रवा/i, 0.65],
  [/maida|atta|flour|मैदा|आटा/i, 0.53],
  [/khoya|khoa|mawa|खोया|मावा/i, 0.6],
  [/rice|chawal|चावल/i, 0.8],
  [/dal|lentil|दाल/i, 0.82],
  [/coconut|nariyal|नारियल/i, 0.4],
  [/poha|पोहा/i, 0.3],
  [/paneer|पनीर/i, 0.5],
  [/nut|almond|cashew|dry ?fruit|badam|kaju|mewa|मेवा|बादाम|काजू/i, 0.55],
];

function katoriAmount(katoris: number, ingredient: string, katoriMl: number) {
  const density = DENSITY.find(([re]) => re.test(ingredient))?.[1] ?? 0.6;
  const base = density === "liquid" ? katoris * katoriMl : katoris * katoriMl * density;
  const round = (n: number) => (n >= 50 ? Math.round(n / 5) * 5 : Math.round(n));
  return { min: round(base * 0.9), max: round(base * 1.1), unit: density === "liquid" ? "ml" : "g" };
}

// Number words (Hindi and Hinglish) for parsing "do chammach", "आधी कटोरी"… Fractions first.
const COUNT_WORDS: [RegExp, number][] = [
  [/आधा|आधी|aadh?a|aadhi|half/i, 0.5],
  [/डेढ़|dedh|derh/i, 1.5],
  [/ढाई|dhai/i, 2.5],
  [/सवा|sawa|sava/i, 1.25],
  [/एक|\bek\b|\bone\b/i, 1],
  [/दो|\bdo\b|\btwo\b/i, 2],
  [/तीन|\bteen\b|\bthree\b/i, 3],
  [/चार|\bchaar?\b|\bfour\b/i, 4],
  [/पाँच|पांच|\bpaa?nch\b|\bfive\b/i, 5],
];

function countIn(text: string): number {
  const digits = text.match(/\d+(?:\.\d+)?/);
  if (digits) return Number(digits[0]);
  return COUNT_WORDS.find(([re]) => re.test(text))?.[1] ?? 1;
}

/** Fallback for spoons, fistfuls and pinches when the model left the amount empty. */
function householdAmount(q: string): { min: number; max: number; unit: string } | null {
  const n = countIn(q);
  const spoon = /चम्मच|chamm?ach|spoon|tbsp|tsp/i.test(q);
  if (spoon && /बड़ा|बड़े|bada|bade|tbsp|table/i.test(q)) return { min: n, max: n, unit: "tbsp" };
  if (spoon) return { min: n, max: n, unit: "tsp" };
  if (/मुट्ठी|mutth?i|fistful|handful/i.test(q)) return { min: Math.round(30 * n), max: Math.round(45 * n), unit: "g" };
  if (/चुटकी|chutki|pinch/i.test(q)) return { min: n, max: n, unit: n === 1 ? "pinch" : "pinches" };
  return null;
}

// Household measures are never exact, in romanised and Devanagari forms.
const FUZZY_MEASURE =
  /katori|mutth?i|chutki|thoda|chamm?ach|glass|andaa?z|pinch|handful|bowl|cup|कटोरी|मुट्ठी|चुटकी|थोड़ा|थोड़ी|चम्मच|गिलास|अंदाज़?|कप|प्याला/i;

/** True when most words of `quote` really occur in the source, i.e. the elder said it. */
function grounded(quote: string, source: string): boolean {
  const words = (s: string) => s.toLowerCase().split(/[\s\p{P}]+/u).filter((w) => w.length > 1);
  const q = words(quote);
  if (q.length < 2) return false;
  const src = new Set(words(source));
  return q.filter((w) => src.has(w)).length / q.length >= 0.7;
}

// Models occasionally drift from the schema; coerce everything into the shape the app expects.
function normalise(r: Record<string, unknown>, ctx: { segmentCount: number; source: string; katoriMl: number }) {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
  const strOrNull = (v: unknown) => (str(v) && str(v).toLowerCase() !== "null" ? str(v) : null);
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  const indices = (v: unknown) =>
    Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < ctx.segmentCount) : [];
  const objects = (v: unknown) => (Array.isArray(v) ? v.map((x) => (x ?? {}) as Record<string, unknown>) : []);

  const ingredients: Ingredient[] = objects(r.ingredients).map((i) => {
    const name = str(i.name);
    const original = str(i.original);
    const quantityOriginal = str(i.quantityOriginal);
    // Katori amounts are always converted here, from the elder's words if the model didn't count.
    const katoris = num(i.katoris) ?? (/कटोरी|katori/i.test(quantityOriginal) ? countIn(quantityOriginal) : null);
    let min = num(i.min);
    let max = num(i.max);
    let unit = str(i.unit);
    if (katoris && katoris > 0) {
      ({ min, max, unit } = katoriAmount(katoris, `${name} ${original}`, ctx.katoriMl));
    } else if (min == null && max == null) {
      ({ min, max, unit } = householdAmount(quantityOriginal) ?? { min, max, unit: "" });
    }
    const fuzzy = FUZZY_MEASURE.test(quantityOriginal);
    if (fuzzy && min != null && max != null && min === max && min > 1) {
      [min, max] = [Math.round(min * 0.9), Math.round(max * 1.1)];
    }
    const note = str(i.note);
    return {
      name,
      original,
      quantityOriginal,
      min,
      max,
      unit,
      isEstimate: fuzzy || Boolean(katoris) || i.isEstimate !== false,
      substitutes: list(i.substitutes),
      note: note && !/[=≈]|\d\s*(g|ml)\b/i.test(note) ? note : undefined,
    };
  });

  // Keep only cues whose quote the elder really said.
  const cues = objects(r.cues).map((c) => {
    const sense = str(c.sense) as CueSense;
    return grounded(str(c.quote), ctx.source)
      ? { cue: str(c.cue), sense: SENSES.includes(sense) ? sense : ("sight" as CueSense) }
      : null;
  });

  const steps: Step[] = objects(r.steps).map((s) => {
    const cue = cues[num(s.cue) ?? -1] ?? null;
    const timer = num(s.timerSeconds);
    return {
      instruction: str(s.instruction),
      originalQuote: str(s.originalQuote),
      sensoryCue: cue?.cue ?? "",
      cueSense: cue?.sense ?? "sight",
      timerSeconds: timer && timer > 0 ? Math.round(timer) : null,
      segments: indices(s.segments),
      clipStart: null,
      clipEnd: null,
    };
  });

  // Steps without a cue are exactly the questions a grandchild wouldn't know to ask.
  const missing = list(r.missing);
  for (const s of steps.filter((s) => s.instruction && !s.sensoryCue).slice(0, 3)) {
    missing.push(`How do you know this step is done: "${s.instruction.replace(/\.$/, "")}"?`);
  }

  const servings = str(r.servings);
  return {
    title: str(r.title) || "Untitled family recipe",
    titleOriginal: str(r.titleOriginal),
    summary: str(r.summary),
    festival: strOrNull(r.festival),
    taughtBy: strOrNull(r.taughtBy),
    story: str(r.story),
    storyQuote: str(r.storyQuote),
    storySegments: indices(r.storySegments),
    servings: /missing|unknown|not (mentioned|specified|given)|n\/a|^none$/i.test(servings) ? "" : servings,
    ingredients: ingredients.filter((i) => i.name || i.original),
    steps: steps.filter((s) => s.instruction),
    tips: list(r.tips),
    missing,
  };
}
