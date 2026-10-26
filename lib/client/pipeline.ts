// The capture-to-recipe pipeline: recording -> Saaras v3 batch (speakers + timestamps)
// -> Andaaz engine -> a Recipe saved on this device.

import { guessElderSpeaker, withClips } from "@/lib/recipe";
import type { Recipe, Segment } from "@/lib/types";
import { getJson, poll, postForm, postJson } from "./api";
import { toWavChunks } from "./audio";
import { newId, saveMedia, saveRecipe } from "./store";

type Stage = (label: string) => void;

interface BatchResult {
  state: string;
  error?: string;
  language?: string | null;
  files?: Record<string, Segment[]>;
}

// Sarvam's batch API can't read the WebM/MP4 audio browsers record, so every recording is
// converted to 16 kHz mono WAV (what Sarvam recommends). Parts are 2 minutes (~3.8 MB), small
// enough to pass through our server route under Vercel's ~4.5 MB request limit.
const PART_SECONDS = 120;

export async function transcribeRecording(
  blob: Blob,
  opts: { language: string; speakers: number; onStage: Stage },
): Promise<{ segments: Segment[]; language: string | null }> {
  opts.onStage("Preparing the audio");
  let parts: Blob[];
  try {
    parts = await toWavChunks(blob, PART_SECONDS);
  } catch {
    throw new Error("This browser couldn't read that file's audio. Try an MP3, WAV or M4A recording.");
  }
  if (!parts.length) throw new Error("This recording has no audio Andaaz can hear.");
  const names = parts.map((_, i) => `part-${String(i).padStart(3, "0")}.wav`);

  opts.onStage("Creating a Saaras v3 batch job");
  const { jobId } = await postJson<{ jobId: string }>("/api/batch", {
    action: "create",
    files: names,
    language: opts.language,
    speakers: opts.speakers,
  });

  opts.onStage(parts.length > 1 ? `Uploading ${parts.length} parts to Sarvam` : "Uploading the recording to Sarvam");
  for (const [i, part] of parts.entries()) {
    const form = new FormData();
    form.append("jobId", jobId);
    form.append("fileName", names[i]);
    form.append("file", part, names[i]);
    await postForm("/api/batch", form);
  }

  await postJson("/api/batch", { action: "start", jobId });
  opts.onStage("Saaras v3 is listening: separating voices and timestamping");
  const result = await poll(
    () => getJson<BatchResult>(`/api/batch?jobId=${encodeURIComponent(jobId)}`),
    (r) => r.state === "Completed" || r.state === "Failed",
    { intervalMs: 4000 },
  );
  if (result.state === "Failed") throw new Error(result.error || "Transcription failed.");

  // Each part is diarized separately, so speaker numbers don't match across parts: label the
  // elder within each part ("0", everyone else "1"), then shift times onto one timeline.
  const segments: Segment[] = [];
  names.forEach((name, i) => {
    const partSegments = result.files?.[name] ?? [];
    const elder = guessElderSpeaker(partSegments);
    const offset = i * PART_SECONDS;
    for (const s of partSegments) {
      segments.push({ ...s, speaker: s.speaker === elder ? "0" : "1", start: s.start + offset, end: s.end + offset });
    }
  });
  return { segments, language: result.language ?? null };
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
