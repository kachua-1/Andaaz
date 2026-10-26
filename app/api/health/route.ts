// Checks that the server's Sarvam key is set and accepted, using a free call (list models).
// Reports only the key's shape, never the key itself.

import { SarvamAIError } from "sarvamai";
import { apiKey, handle, sarvam } from "@/lib/server/sarvam";

export const GET = handle(async () => {
  const key = apiKey();
  if (!key) return Response.json({ ok: false, reason: "SARVAM_API_KEY is not set on the server." }, { status: 500 });

  const shape = { length: key.length, startsWithSk: key.startsWith("sk_") };
  try {
    await sarvam().chatCompletion.listModelsV2();
    return Response.json({ ok: true, key: shape });
  } catch (err) {
    const reason = err instanceof SarvamAIError ? `Sarvam rejected the key (${err.statusCode ?? "network"}).` : String(err);
    return Response.json({ ok: false, key: shape, reason }, { status: 502 });
  }
});
