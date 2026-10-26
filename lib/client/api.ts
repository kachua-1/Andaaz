// Small fetch helpers for the app's own API routes (which call Sarvam on the server).

import { loadSettings } from "./settings";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const code = loadSettings().accessCode;
  return { ...(code ? { "x-access-code": code } : {}), ...extra };
}

async function check(res: Response): Promise<Response> {
  if (res.ok) return res;
  let message = "";
  try {
    message = (await res.json()).error;
  } catch {
    // not JSON
  }
  throw new Error(message || `Request failed (${res.status})`);
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return (await check(res)).json();
}

export async function postForm<T>(path: string, form: FormData): Promise<T> {
  return (await check(await fetch(path, { method: "POST", headers: headers(), body: form }))).json();
}

export async function getJson<T>(path: string): Promise<T> {
  return (await check(await fetch(path, { headers: headers() }))).json();
}

export async function postForAudio(path: string, body: unknown): Promise<Blob> {
  const res = await fetch(path, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return (await check(res)).blob();
}

/**
 * Calls `fn` every `intervalMs` until `isDone` says so, or throws after `timeoutMs`.
 * A few failures in a row are tolerated so one network blip doesn't lose a running job.
 */
export async function poll<T>(
  fn: () => Promise<T>,
  isDone: (value: T) => boolean,
  { intervalMs = 3000, timeoutMs = 15 * 60_000, maxFailures = 4 } = {},
): Promise<T> {
  const started = Date.now();
  let failures = 0;
  for (;;) {
    try {
      const value = await fn();
      failures = 0;
      if (isDone(value)) return value;
    } catch (err) {
      if (++failures >= maxFailures) throw err;
    }
    if (Date.now() - started > timeoutMs) throw new Error("Sarvam is taking too long. Try again in a bit.");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
