// Batch speech to text (Saaras v3) for whole recordings. Only the Batch API returns
// speaker-separated (diarized) segments with timestamps, which Andaaz needs to tell the
// grandparent's voice apart and to cut her audio clips for each step.
//
// Flow: POST {action:"create", files} -> POST each WAV part here as multipart (Sarvam's job
// storage doesn't accept direct browser uploads) -> POST {action:"start"} -> poll GET ?jobId=,
// which returns each part's segments keyed by its file name.

import type { SarvamAI } from "sarvamai";
import { handle, HttpError, readJson, sarvam } from "@/lib/server/sarvam";
import type { Segment } from "@/lib/types";

export const maxDuration = 60;

interface ActionBody {
  action: "create" | "start";
  jobId?: string;
  files?: string[];
  language?: string;
  speakers?: number;
}

export const POST = handle(async (req) => {
  const s = sarvam();

  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    const jobId = String(form.get("jobId") ?? "");
    const fileName = String(form.get("fileName") ?? "");
    const file = form.get("file");
    if (!jobId || !fileName || !(file instanceof Blob)) {
      throw new HttpError(400, "jobId, fileName and file are required.");
    }
    await putToStorage(await uploadUrl(jobId, fileName), file);
    return Response.json({ ok: true });
  }

  const body = await readJson<ActionBody>(req);

  if (body.action === "create") {
    const files = (body.files ?? []).map(safeFileName);
    if (files.length < 1 || files.length > 50) throw new HttpError(400, "Send between 1 and 50 file names.");
    const speakers = Math.min(Math.max(Math.round(body.speakers ?? 2), 1), 5);
    const job = await s.speechToTextJob.initialise({
      job_parameters: {
        model: "saaras:v3",
        mode: "transcribe",
        language_code: (body.language || "unknown") as SarvamAI.SpeechToTextLanguage,
        with_timestamps: true,
        with_diarization: speakers > 1,
        ...(speakers > 1 ? { num_speakers: speakers } : {}),
      },
    });
    return Response.json({ jobId: job.job_id, files });
  }

  if (body.action === "start") {
    if (!body.jobId) throw new HttpError(400, "jobId is required.");
    const status = await s.speechToTextJob.start(body.jobId);
    return Response.json({ state: status.job_state });
  }

  throw new HttpError(400, "Unknown action.");
});

export const GET = handle(async (req) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new HttpError(400, "jobId is required.");
  const s = sarvam();

  const status = await s.speechToTextJob.getStatus(jobId);
  const state = status.job_state;
  if (state === "Failed") {
    return Response.json({ state, error: status.error_message || firstFileError(status) || "Transcription failed." });
  }
  if (state !== "Completed") return Response.json({ state });

  const done = (status.job_details ?? []).filter((d) => d.inputs?.length && d.outputs?.length);
  if (!done.length) {
    return Response.json({ state: "Failed", error: firstFileError(status) || "Sarvam returned no transcript." });
  }
  const links = await s.speechToTextJob.getDownloadLinks({
    job_id: jobId,
    files: done.map((d) => d.outputs![0].file_name),
  });

  const files: Record<string, Segment[]> = {};
  let language: string | null = null;
  await Promise.all(
    done.map(async (d) => {
      const url = links.download_urls[d.outputs![0].file_name]?.file_url;
      if (!url) return;
      const out = (await (await fetch(url)).json()) as BatchOutput;
      files[d.inputs![0].file_name] = toSegments(out);
      language ??= out.language_code ?? null;
    }),
  );
  return Response.json({ state, language, files });
});

interface BatchOutput {
  transcript?: string;
  language_code?: string;
  timestamps?: { words?: string[]; start_time_seconds?: number[]; end_time_seconds?: number[] } | null;
  diarized_transcript?: {
    entries?: { transcript: string; start_time_seconds: number; end_time_seconds: number; speaker_id: string }[];
  } | null;
}

function toSegments(out: BatchOutput): Segment[] {
  const entries = out.diarized_transcript?.entries;
  if (entries?.length) {
    return entries.map((e) => ({
      speaker: String(e.speaker_id),
      text: e.transcript,
      start: e.start_time_seconds,
      end: e.end_time_seconds,
    }));
  }
  const t = out.timestamps;
  if (t?.words?.length) {
    return t.words.map((w, i) => ({
      speaker: "0",
      text: w,
      start: t.start_time_seconds?.[i] ?? 0,
      end: t.end_time_seconds?.[i] ?? 0,
    }));
  }
  return out.transcript ? [{ speaker: "0", text: out.transcript, start: 0, end: 0 }] : [];
}

function firstFileError(status: SarvamAI.JobStatusResponse): string | undefined {
  return status.job_details?.find((d) => d.error_message)?.error_message;
}

async function uploadUrl(jobId: string, fileName: string): Promise<string> {
  const links = await sarvam().speechToTextJob.getUploadLinks({ job_id: jobId, files: [fileName] });
  const url = links.upload_urls[fileName]?.file_url;
  if (!url) throw new HttpError(502, "Sarvam did not return an upload link.");
  return url;
}

// The batch API checks the upload's Content-Type against this list and rejects others (e.g. the
// "audio/webm;codecs=opus" browsers record). application/octet-stream makes it auto-detect.
const BATCH_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/aac",
  "audio/x-aac",
  "audio/aiff",
  "audio/x-aiff",
]);

async function putToStorage(url: string, file: Blob): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    body: file,
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": BATCH_TYPES.has(file.type) ? file.type : "application/octet-stream",
    },
  });
  if (!res.ok) throw new HttpError(502, `Uploading the recording to Sarvam failed (${res.status}).`);
}

function safeFileName(name: string | undefined): string {
  const cleaned = (name || "recording.wav").replace(/[^\w.-]+/g, "_").slice(-80);
  return /\.\w{2,4}$/.test(cleaned) ? cleaned : `${cleaned}.wav`;
}
