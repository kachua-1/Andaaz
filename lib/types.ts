// Shared shapes used by both the browser and the API routes.

/** One stretch of speech from the batch transcript (diarized, with timestamps). */
export interface Segment {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

/** One exchange in a live interview session. */
export interface Turn {
  who: "interviewer" | "elder";
  text: string;
}

export interface Ingredient {
  /** Common name a learner anywhere would recognise, e.g. "Gram flour". */
  name: string;
  /** What the elder called it, in their own words/script, e.g. "बेसन". */
  original: string;
  /** The elder's own measure, e.g. "ek mutthi", "thoda sa". */
  quantityOriginal: string;
  min: number | null;
  max: number | null;
  unit: string;
  isEstimate: boolean;
  substitutes: string[];
  note?: string;
}

export type CueSense = "sight" | "smell" | "sound" | "touch" | "taste" | "time";

export interface Step {
  instruction: string;
  /** The elder's own words for this step, in their language. */
  originalQuote: string;
  /** The sensory checkpoint that tells you the step is done. */
  sensoryCue: string;
  cueSense: CueSense;
  timerSeconds: number | null;
  /** Indices into Recipe.segments that this step came from. */
  segments: number[];
  clipStart: number | null;
  clipEnd: number | null;
}

export interface Translation {
  language: string;
  title: string;
  story: string;
  steps: { instruction: string; sensoryCue: string }[];
  ingredients: string[];
}

export interface Recipe {
  id: string;
  createdAt: number;
  source: "interview" | "recording" | "diary" | "sample";
  title: string;
  titleOriginal: string;
  summary: string;
  language: string;
  elderName: string;
  taughtBy: string | null;
  festival: string | null;
  story: string;
  storyQuote: string;
  storySegments: number[];
  servings: string;
  ingredients: Ingredient[];
  steps: Step[];
  tips: string[];
  missing: string[];
  segments: Segment[];
  elderSpeaker: string | null;
  /** IndexedDB key of the original audio/video recording, if any. */
  mediaId: string | null;
  mediaType: string | null;
  /** IndexedDB key of a digitised diary image, if any. */
  diaryImageId: string | null;
  diaryText: string | null;
  translations: Record<string, Translation>;
}
