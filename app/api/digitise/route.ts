// Sarvam Vision (Document Intelligence "digitise"): reads old recipe diaries, including
// handwriting, into text. The app shows the raw result so the family can check it first.

import { handle, HttpError, sarvam } from "@/lib/server/sarvam";

export const maxDuration = 60;

const CONTENT_TYPES = ["printed", "handwritten", "mixed"] as const;
type ContentType = (typeof CONTENT_TYPES)[number];

export const POST = handle(async (req) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) throw new HttpError(400, "No diary page received.");
  const language = String(form.get("language") || "hi-IN");
  const requested = String(form.get("contentType") || "handwritten") as ContentType;
  const contentType = CONTENT_TYPES.includes(requested) ? requested : "handwritten";

  const job = await sarvam().docAi.digitise({ file: [file], language, content_type: contentType });
  return Response.json({ jobId: job.job_id, status: job.status });
});

export const GET = handle(async (req) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new HttpError(400, "jobId is required.");
  const s = sarvam();

  const status = await s.docAi.getStatus(jobId);
  if (status.status === "failed" || status.status === "rejected") {
    return Response.json({ status: status.status, error: `Sarvam Vision could not read this page (${status.status}).` });
  }
  if (status.status !== "completed" && status.status !== "partially_completed") {
    return Response.json({ status: status.status });
  }

  // JSON is the one format every job can serve ("md" is refused when a job produced HTML, and
  // "html" arrives as a zip). Each page holds text blocks with a reading order.
  const results = (await s.docAi.getResults(jobId, { format: "json" })) as unknown as {
    documents?: { pages?: { blocks?: { text?: string; layout_tag?: string; reading_order?: number }[] }[] }[];
  };
  const pages = (results.documents ?? []).flatMap((d) => d.pages ?? []);
  const text = pages
    .map((page) =>
      [...(page.blocks ?? [])]
        .sort((a, b) => (a.reading_order ?? 0) - (b.reading_order ?? 0))
        .map((b) => (b.layout_tag?.includes("title") ? `## ${b.text ?? ""}` : (b.text ?? "")))
        .filter((line) => line.replace(/^## /, "").trim())
        .join("\n"),
    )
    .join("\n\n")
    .trim();
  return Response.json({ status: status.status, markdown: text, pages: pages.length });
});
