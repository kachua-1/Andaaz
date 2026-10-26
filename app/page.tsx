"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS, loadSettings, type Settings } from "@/lib/client/settings";
import { listRecipes, newId, saveRecipe } from "@/lib/client/store";
import { sampleRecipe } from "@/lib/sample";
import type { Recipe } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Rough month for common festivals so the calendar can place them; unknown ones go under "Any time".
const FESTIVAL_MONTH: [RegExp, number][] = [
  [/lohri|sankranti|pongal|bihu|uttarayan/i, 0],
  [/basant|vasant|shivratri/i, 1],
  [/holi|gudi|ugadi/i, 2],
  [/baisakhi|vaisakhi|vishu|navratri.*chaitra|ram ?navami|poila/i, 3],
  [/teej|raksha|rakhi|janmashtami|onam/i, 7],
  [/ganesh|ganpati/i, 8],
  [/navratri|durga|dussehra|dasara|puja/i, 9],
  [/diwali|deepavali|karwa|bhai ?dooj|chhath|govardhan/i, 10],
  [/christmas/i, 11],
];

function festivalMonth(festival: string): number | null {
  return FESTIVAL_MONTH.find(([re]) => re.test(festival))?.[1] ?? null;
}

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
    listRecipes()
      .then(setRecipes)
      .catch(() => setRecipes([]));
  }, []);

  async function addSample() {
    await saveRecipe(sampleRecipe(newId()));
    setRecipes(await listRecipes());
  }

  const calendar = useMemo(() => {
    const months = new Map<number | null, Recipe[]>();
    for (const r of recipes ?? []) {
      if (!r.festival) continue;
      const m = festivalMonth(r.festival);
      months.set(m, [...(months.get(m) ?? []), r]);
    }
    return months;
  }, [recipes]);

  const tree = useMemo(() => {
    const roots = new Map<string, Map<string, Recipe[]>>();
    for (const r of recipes ?? []) {
      const root = r.taughtBy || "Family tradition";
      const elders = roots.get(root) ?? new Map<string, Recipe[]>();
      elders.set(r.elderName, [...(elders.get(r.elderName) ?? []), r]);
      roots.set(root, elders);
    }
    return roots;
  }, [recipes]);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">{settings.familyName}&apos;s living cookbook</p>
        <h1>Grandparents&apos; recipes, taught back in their own voice.</h1>
        <p className="lede">
          {settings.elderName} just talks. Andaaz listens, asks the questions a grandchild wouldn&apos;t know to ask,
          turns <span className="quote-mark">&ldquo;ek mutthi besan, jab tak tel chhodne na lage&rdquo;</span> into steps
          you can follow, and keeps {settings.elderName}&apos;s voice guiding every step.
        </p>
        <div className="actions">
          <Link className="btn primary" href="/capture">
            🎙️ Record with {settings.elderName}
          </Link>
          <Link className="btn" href="/capture?mode=upload">
            Upload a recording
          </Link>
          <Link className="btn" href="/capture?mode=diary">
            Digitise a diary page
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <h2>Family cookbook</h2>
          {recipes && recipes.length > 0 && (
            <Link className="btn small" href="/cookbook">
              🖨️ Printable cookbook
            </Link>
          )}
        </div>
        {recipes === null ? (
          <p className="muted">Opening the cookbook…</p>
        ) : recipes.length === 0 ? (
          <div className="card center">
            <p className="lede" style={{ margin: 0 }}>
              No recipes yet. Record {settings.elderName}, upload an old recording, or start with a sample.
            </p>
            <div className="actions">
              <Link className="btn primary" href="/capture">
                Record the first recipe
              </Link>
              <button className="btn" onClick={addSample}>
                Try a sample recipe
              </button>
            </div>
          </div>
        ) : (
          <div className="grid">
            {recipes.map((r) => (
              <Link key={r.id} href={`/recipe/${r.id}`} className="card recipe-card">
                <span className="original">{r.titleOriginal || r.title}</span>
                <strong>{r.title}</strong>
                <span className="muted small">{r.summary}</span>
                <div className="chips">
                  <span className="chip accent">from {r.elderName}</span>
                  {r.festival && <span className="chip festival">🪔 {r.festival}</span>}
                  {r.mediaId && <span className="chip leaf">🔊 {r.elderName}&apos;s voice</span>}
                  {r.source === "diary" && <span className="chip">📖 diary</span>}
                  {r.source === "sample" && <span className="chip">sample</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {recipes && recipes.length > 0 && (
        <section className="section two-col">
          <div>
            <h2>Festival calendar</h2>
            {calendar.size === 0 ? (
              <p className="muted">When {settings.elderName} mentions a festival, the recipe shows up here.</p>
            ) : (
              <div className="calendar">
                {[...MONTHS.map((m, i) => [m, i] as const), ["Any time", null] as const]
                  .filter(([, i]) => calendar.has(i))
                  .map(([label, i]) => (
                    <div key={label} className="month">
                      <strong>{label}</strong>
                      {calendar.get(i)!.map((r) => (
                        <Link key={r.id} href={`/recipe/${r.id}`}>
                          {r.elderName}&apos;s {r.festival} {r.title.toLowerCase()}
                        </Link>
                      ))}
                    </div>
                  ))}
              </div>
            )}
          </div>
          <div>
            <h2>Family recipe tree</h2>
            <ul className="tree card">
              {[...tree].map(([root, elders]) => (
                <li key={root}>
                  <strong>{root}</strong>
                  <ul>
                    {[...elders].map(([elder, list]) => (
                      <li key={elder}>
                        {elder}
                        <ul>
                          {list.map((r) => (
                            <li key={r.id}>
                              <Link href={`/recipe/${r.id}`}>{r.title}</Link>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="section">
        <h2>How Andaaz works</h2>
        <div className="how-steps">
          <div className="card">
            <h3>Capture</h3>
            <p className="small">
              {settings.elderName} talks in their own language. An interviewer asks gentle follow-ups out loud: &ldquo;kitna
              namak?&rdquo;, &ldquo;kaise pata chalta hai ki ho gaya?&rdquo;
            </p>
            <span className="chip">Saaras v3 · Bulbul v3</span>
          </div>
          <div className="card">
            <h3>Decode</h3>
            <p className="small">
              The Andaaz engine turns fistfuls into marked ranges, attaches a sensory checkpoint to every step, and keeps
              the story.
            </p>
            <span className="chip">Sarvam-105B</span>
          </div>
          <div className="card">
            <h3>Translate</h3>
            <p className="small">Grandchildren learn in their own language, across 22 Indian languages plus English.</p>
            <span className="chip">Sarvam Translate</span>
          </div>
          <div className="card">
            <h3>Cook along</h3>
            <p className="small">
              Each step plays {settings.elderName}&apos;s own clip, then narration. Ask &ldquo;agla step&rdquo; or
              &ldquo;how do I know it&apos;s done?&rdquo;
            </p>
            <span className="chip">Saaras v3 · Bulbul v3</span>
          </div>
        </div>
      </section>
    </>
  );
}
