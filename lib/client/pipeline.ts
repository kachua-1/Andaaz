// The capture-to-recipe pipeline: recording -> Saaras v3 batch (speakers + timestamps)
// -> Andaaz engine -> a Recipe saved on this device.

import { guessElderSpeaker, withClips } from "@/lib/recipe";
import type { Recipe, Segment } from "@/lib/types";
import { getJson, poll, postForm, postJson } from "./api";
import { extensionFor } from "./audio";
import { newId, saveMedia, saveRecipe } from "./store";

type Stage = (label: string) => void;

interface BatchResult {
  state: string;
  error?: string;
  transcript?: string;
  language?: string | null;
  segments?: Segment[];
}

// Sarvam's job storage doesn't allow direct browser uploads (no CORS), so recordings go through
// our server route, and Vercel caps request bodies at ~4.5 MB.
const SERVER_UPLOAD_LIMIT = 4_300_000;

export async function transcribeRecording(
  blob: Blob,
  opts: { language: string; speakers: number; onStage: Stage },
): Promise<{ segments: Segment[]; language: string | null }> {
  if (blob.size > SERVER_UPLOAD_LIMIT) {
    throw new Error(
      "This recording is over 4 MB, the upload limit for now. In-app recordings fit about 15 minutes; for MP3s, trim to about 4 minutes.",
    );
  }
  opts.onStage("Creating a Saaras v3 batch job");
  const created = await postJson<{ jobId: string; fileName: string }>("/api/batch", {
    action: "create",
    fileName: `recording.${extensionFor(blob.type)}`,
    language: opts.language,
    speakers: opts.speakers,
  });

  opts.onStage("Uploading the recording to Sarvam");
  const form = new FormData();
  form.append("jobId", created.jobId);
  form.append("fileName", created.fileName);
  form.append("file", blob, created.fileName);
  await postForm("/api/batch", form);

  await postJson("/api/batch", { action: "start", jobId: created.jobId });
  opts.onStage("Saaras v3 is listening: separating voices and timestamping");
  const result = await poll(
    () => getJson<BatchResult>(`/api/batch?jobId=${encodeURIComponent(created.jobId)}`),
    (r) => r.state === "Completed" || r.state === "Failed",
    { intervalMs: 4000 },
  );
  if (result.state === "Failed") throw new Error(result.error || "Transcription failed.");
  return { segments: result.segments ?? [], language: result.language ?? null };
}

type Decoded = Pick<
  Recipe,
  | "title"
  | "titleOriginal"
  | "summary"
  | "festival"
  | "taughtBy"
  | "story"
  | "storyQuote"
  | "storySegments"
  | "servings"
  | "ingredients"
  | "steps"
  | "tips"
  | "missing"
>;

export interface DecodeInput {
  source: "interview" | "recording" | "diary";
  language: string;
  elderName: string;
  katoriMl: number;
  learnerCity: string;
  dishHint?: string;
  segments?: Segment[];
  elderSpeaker?: string | null;
  text?: string;
}

export function decodeRecipe(input: DecodeInput): Promise<Decoded> {
  return postJson<Decoded>("/api/decode", input);
}

/** Runs the full pipeline for an audio/video recording and saves the result. Returns the recipe id. */
export async function recipeFromRecording(
  media: Blob,
  opts: {
    source: "interview" | "recording";
    language: string;
    speakers: number;
    elderName: string;
    katoriMl: number;
    learnerCity: string;
    dishHint?: string;
    fallbackSegments?: Segment[];
    onStage: Stage;
  },
): Promise<string> {
  const mediaId = newId();
  await saveMedia(mediaId, media);

  let segments: Segment[] = [];
  let language = opts.language;
  try {
    const t = await transcribeRecording(media, opts);
    segments = t.segments;
    if (opts.language === "unknown" && t.language) language = t.language;
  } catch (err) {
    // A live interview already has per-turn transcripts; use them (without clips) if batch fails.
    if (!opts.fallbackSegments?.length) throw err;
    segments = opts.fallbackSegments;
  }
  if (!segments.length) throw new Error("Sarvam didn't hear any speech in this recording.");

  const elderSpeaker = guessElderSpeaker(segments);
  opts.onStage("The Andaaz engine is decoding measures, cues and the story");
  const decoded = await decodeRecipe({
    source: opts.source,
    language,
    elderName: opts.elderName,
    katoriMl: opts.katoriMl,
    learnerCity: opts.learnerCity,
    dishHint: opts.dishHint,
    segments,
    elderSpeaker,
  });

  const recipe = withClips({
    ...decoded,
    id: newId(),
    createdAt: Date.now(),
    source: opts.source,
    language,
    elderName: opts.elderName,
    segments,
    elderSpeaker,
    mediaId,
    mediaType: media.type || "audio/webm",
    diaryImageId: null,
    diaryText: null,
    translations: {},
  });
  await saveRecipe(recipe);
  return recipe.id;
}
