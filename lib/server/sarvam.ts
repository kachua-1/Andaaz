// Server-only helpers: the Sarvam client, the optional access-code gate and error handling.
// The API key is read from the environment here and never sent to the browser.

import { type SarvamAI, SarvamAIClient, SarvamAIError } from "sarvamai";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let client: SarvamAIClient | null = null;

/** The configured key, tolerating a pasted "SARVAM_API_KEY=" prefix, quotes or stray whitespace. */
export function apiKey(): string | null {
  const key = (process.env.SARVAM_API_KEY ?? "")
    .trim()
    .replace(/^SARVAM_API_KEY\s*=\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
  return key || null;
}

export function sarvam(): SarvamAIClient {
  const key = apiKey();
  if (!key) throw new HttpError(500, "SARVAM_API_KEY is not set on the server.");
  client ??= new SarvamAIClient({ apiSubscriptionKey: key, timeoutInSeconds: 120, maxRetries: 1 });
  return client;
}

/** Wraps a route handler with the access-code check and uniform JSON errors. */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      const code = process.env.ACCESS_CODE;
      if (code && req.headers.get("x-access-code") !== code) {
        throw new HttpError(401, "This Andaaz needs an access code. Add it in Settings.");
      }
      return await fn(req);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof SarvamAIError) {
    if (!err.statusCode) {
      return Response.json({ error: `Couldn't reach Sarvam (${err.message}). Check the connection and try again.` }, { status: 502 });
    }
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502;
    const detail = describeBody(err.body) || err.message;
    const hint = status === 402 ? " Your Sarvam account is out of credits." : "";
    return Response.json({ error: `Sarvam API error (${status}): ${detail}.${hint}` }, { status });
  }
  console.error(err);
  return Response.json({ error: err instanceof Error ? err.message : "Unexpected server error" }, { status: 500 });
}

function describeBody(body: unknown): string {
  if (!body || typeof body !== "object") return typeof body === "string" ? body : "";
  const b = body as Record<string, unknown>;
  const inner = (b.error ?? b) as Record<string, unknown>;
  return String(inner.message ?? inner.detail ?? inner.title ?? JSON.stringify(body)).slice(0, 300);
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Expected a JSON body.");
  }
}

type ChatModel = "sarvam-105b" | "sarvam-105b-conversations";

/** One chat completion with a system and user message; returns the reply text. */
export async function chat(opts: {
  system: string;
  user: string;
  model?: ChatModel;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const res = await sarvam().chat.completions({
    model: opts.model ?? "sarvam-105b",
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 2000,
    // Sarvam-105B reasons by default, and even on "low" it can spend the whole token budget
    // thinking and return null content. Passing null turns reasoning off.
    reasoning_effort: null as unknown as SarvamAI.ReasoningEffort,
    ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
  });
  return res.choices[0]?.message?.content ?? "";
}

/** Runs `fn` over `items` with at most `limit` calls in flight, keeping order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Pulls the first JSON object out of a model reply, tolerating code fences or stray text. */
export function parseModelJson<T>(text: string): T {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new HttpError(502, "The model did not return JSON. Try again.");
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    throw new HttpError(502, "The model returned malformed JSON. Try again.");
  }
}
