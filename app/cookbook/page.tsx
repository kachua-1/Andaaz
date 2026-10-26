"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, loadSettings, type Settings } from "@/lib/client/settings";
import { listRecipes } from "@/lib/client/store";
import { estimateLabel, formatClock } from "@/lib/recipe";
import type { Recipe } from "@/lib/types";

export default function CookbookPage() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
    listRecipes()
      .then(setRecipes)
      .catch(() => setRecipes([]));
  }, []);

  if (recipes === null) return <p className="muted">Gathering the recipes…</p>;
  if (recipes.length === 0) {
    return (
      <div className="card center">
        <p>The cookbook is empty. Record a recipe first.</p>
        <Link className="btn primary" href="/capture">
          Record a recipe
        </Link>
      </div>
    );
  }

  const elders = [...new Set(recipes.map((r) => r.elderName))];

  return (
    <div>
      <div className="actions no-print" style={{ justifyContent: "space-between", marginBottom: 20 }}>
        <p className="muted" style={{ margin: 0 }}>
          A printable family cookbook. Use your browser&apos;s print dialog to save it as a PDF.
        </p>
        <button className="btn primary" onClick={() => window.print()}>
          🖨️ Print / Save as PDF
        </button>
      </div>

      <section className="cover">
        <p className="eyebrow">A living family cookbook</p>
        <h1 style={{ maxWidth: "none" }}>{settings.familyName}&apos;s Andaaz</h1>
        <p className="lede" style={{ margin: "0 auto" }}>
          Recipes as {elders.join(", ")} taught them: by estimation, by smell, by sound, and with a story.
        </p>
        <ol style={{ textAlign: "left", display: "inline-block", marginTop: 24 }}>
          {recipes.map((r) => (
            <li key={r.id}>
              {r.title} {r.titleOriginal && <span className="muted">· {r.titleOriginal}</span>}
            </li>
          ))}
        </ol>
      </section>

      {recipes.map((r) => (
        <article key={r.id} className="print-recipe card section">
          {r.titleOriginal && <p className="original" style={{ fontSize: "2rem", color: "var(--accent)", margin: 0, fontWeight: 700 }}>{r.titleOriginal}</p>}
          <h2>{r.title}</h2>
          <p className="muted">
            As taught by {r.elderName}
            {r.taughtBy ? `, who learned it from ${r.taughtBy}` : ""}
            {r.festival ? ` · made for ${r.festival}` : ""}
            {r.servings ? ` · ${r.servings}` : ""}
          </p>
          {r.storyQuote && <blockquote style={{ fontStyle: "italic", margin: "0 0 8px" }}>&ldquo;{r.storyQuote}&rdquo;</blockquote>}
          {r.story && <p>{r.story}</p>}

          <h3>Ingredients</h3>
          <table>
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>{r.elderName} said</th>
                <th>Approximately</th>
              </tr>
            </thead>
            <tbody>
              {r.ingredients.map((i, k) => (
                <tr key={k}>
                  <td>
                    {i.name} {i.original && <span className="muted">({i.original})</span>}
                  </td>
                  <td>{i.quantityOriginal || "—"}</td>
                  <td>{estimateLabel(i)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 16 }}>Method</h3>
          <ol>
            {r.steps.map((s, k) => (
              <li key={k} style={{ marginBottom: 8 }}>
                <strong>{s.instruction}</strong>
                {s.timerSeconds ? ` (about ${formatClock(s.timerSeconds)})` : ""}
                {s.sensoryCue && <div>How to know: {s.sensoryCue}</div>}
                {s.originalQuote && <div className="muted">&ldquo;{s.originalQuote}&rdquo;</div>}
              </li>
            ))}
          </ol>
          {r.missing.length > 0 && (
            <p className="muted small">Still to ask {r.elderName}: {r.missing.join(" · ")}</p>
          )}
        </article>
      ))}
    </div>
  );
}
