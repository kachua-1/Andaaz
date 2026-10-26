// Pure helpers shared by pages: finding the elder's voice and cutting step clips.

import type { Ingredient, Recipe, Segment } from "./types";

/** The elder usually talks the most, so pick the speaker with the most speaking time. */
export function guessElderSpeaker(segments: Segment[]): string | null {
  const totals = new Map<string, number>();
  for (const s of segments) {
    const weight = s.end > s.start ? s.end - s.start : s.text.length / 15;
    totals.set(s.speaker, (totals.get(s.speaker) ?? 0) + weight);
  }
  let best: string | null = null;
  let max = -1;
  for (const [speaker, total] of totals) {
    if (total > max) [best, max] = [speaker, total];
  }
  return best;
}

export function speakers(segments: Segment[]): string[] {
  return [...new Set(segments.map((s) => s.speaker))];
}

/** Time range covering the elder's lines among `indices` (falls back to any listed line). */
export function clipRange(indices: number[], segments: Segment[], elder: string | null): { start: number; end: number } | null {
  const listed = indices.map((i) => segments[i]).filter((s): s is Segment => Boolean(s) && s.end > s.start);
  const own = listed.filter((s) => s.speaker === elder);
  const use = own.length ? own : listed;
  if (!use.length) return null;
  return {
    start: Math.max(0, Math.min(...use.map((s) => s.start)) - 0.2),
    end: Math.max(...use.map((s) => s.end)) + 0.3,
  };
}

/** Recomputes every step's clip from its segment pointers (e.g. after fixing who the elder is). */
export function withClips(recipe: Recipe): Recipe {
  return {
    ...recipe,
    steps: recipe.steps.map((step) => {
      const range = clipRange(step.segments, recipe.segments, recipe.elderSpeaker);
      return { ...step, clipStart: range?.start ?? null, clipEnd: range?.end ?? null };
    }),
  };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

export function estimateLabel(i: Ingredient): string {
  if (i.min == null && i.max == null) return "amount not said";
  const range = i.min != null && i.max != null && i.min !== i.max ? `${fmt(i.min)}–${fmt(i.max)}` : fmt((i.min ?? i.max) as number);
  return `${i.isEstimate ? "≈ " : ""}${range}${i.unit ? ` ${i.unit}` : ""}`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export const SENSE_ICON: Record<string, string> = {
  sight: "👀",
  smell: "👃",
  sound: "👂",
  touch: "✋",
  taste: "👅",
  time: "⏱️",
};
