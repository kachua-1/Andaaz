"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ClipPlayer } from "@/lib/client/audio";
import { loadSettings } from "@/lib/client/settings";
import { deleteRecipe, getMedia, getRecipe, saveRecipe } from "@/lib/client/store";
import { ensureTranslation, stepText } from "@/lib/client/translate";
import { languageName, LANGUAGES } from "@/lib/languages";
import { clipRange, estimateLabel, formatClock, SENSE_ICON, speakers, withClips } from "@/lib/recipe";
import type { Recipe } from "@/lib/types";

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  const [lang, setLang] = useState("en-IN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [katoriMl, setKatoriMl] = useState(150);
  const [mediaReady, setMediaReady] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [diaryUrl, setDiaryUrl] = useState<string | null>(null);
  const player = useRef<ClipPlayer | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const s = loadSettings();
    setLang(s.learnerLanguage);
    setKatoriMl(s.katoriMl);
    let urls: string[] = [];
    getRecipe(id).then(async (r) => {
      setRecipe(r ?? null);
      if (!r) return;
      if (r.mediaId) {
        const blob = await getMedia(r.mediaId);
        if (blob && r.mediaType?.startsWith("video")) {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setVideoUrl(url);
          setMediaReady(true);
        } else if (blob) {
          player.current = new ClipPlayer();
          player.current
            .load(blob)
            .then(() => setMediaReady(true))
            .catch(() => setError("This browser couldn't open the saved recording."));
        }
      }
      if (r.diaryImageId) {
        const blob = await getMedia(r.diaryImageId);
        if (blob?.type.startsWith("image")) {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setDiaryUrl(url);
        }
      }
    });
    return () => {
      player.current?.close();
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls = [];
    };
  }, [id]);

  async function playRange(start: number | null, end: number | null) {
    if (start == null || end == null) return;
    if (video.current) {
      const v = video.current;
      v.currentTime = start;
      await v.play();
      const stop = () => {
        if (v.currentTime >= end) {
          v.pause();
          v.removeEventListener("timeupdate", stop);
        }
      };
      v.addEventListener("timeupdate", stop);
    } else {
      await player.current?.play(start, end);
    }
  }

  async function translate() {
    if (!recipe) return;
    setBusy(true);
    setError("");
    try {
      setRecipe(await ensureTranslation(recipe, lang));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function setElderSpeaker(speaker: string) {
    if (!recipe) return;
    const updated = withClips({ ...recipe, elderSpeaker: speaker });
    await saveRecipe(updated);
    setRecipe(updated);
  }

  async function remove() {
    if (!recipe || !confirm(`Delete "${recipe.title}" and its recording from this device?`)) return;
    await deleteRecipe(recipe);
    router.push("/");
  }

  if (recipe === undefined) return <p className="muted">Opening the recipe…</p>;
  if (recipe === null) {
    return (
      <div className="card center">
        <p>This recipe isn&apos;t on this device. Recipes are saved in the browser where they were recorded.</p>
        <Link className="btn" href="/">
          Back to the cookbook
        </Link>
      </div>
    );
  }

  const elder = recipe.elderName;
  const t = lang !== "en-IN" ? recipe.translations[lang] : undefined;
  const needsTranslation = lang !== "en-IN" && !t;
  const storyClip = clipRange(recipe.storySegments, recipe.segments, recipe.elderSpeaker);
  const voices = speakers(recipe.segments);
  const usesKatori = recipe.ingredients.some((i) => /katori|कटोरी/i.test(i.quantityOriginal));

  return (
    <article>
      <Link href="/" className="small no-print">
        ← Family cookbook
      </Link>

      <header className="recipe-head" style={{ marginTop: 12 }}>
        {recipe.titleOriginal && <p className="original">{recipe.titleOriginal}</p>}
        <h1 style={{ marginTop: 4 }}>{t?.title || recipe.title}</h1>
        {recipe.summary && <p className="lede">{recipe.summary}</p>}
        <div className="chips">
          <span className="chip accent">as {elder} teaches it</span>
          {recipe.taughtBy && <span className="chip">learned from {recipe.taughtBy}</span>}
          {recipe.festival && <span className="chip festival">🪔 {recipe.festival}</span>}
          {recipe.servings && <span className="chip">🍽️ {recipe.servings}</span>}
          <span className="chip">spoken in {languageName(recipe.language)}</span>
        </div>
      </header>

      <div className="card actions no-print" style={{ marginTop: 20, justifyContent: "space-between" }}>
        <div className="actions">
          <Link className="btn primary" href={`/recipe/${recipe.id}/cook?lang=${lang}`}>
            👩‍🍳 Start cook-along
          </Link>
          <label className="field" style={{ flexDirection: "row", alignItems: "center" }}>
            Learn in
            <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ width: "auto" }}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          {needsTranslation && (
            <button className="btn" onClick={translate} disabled={busy}>
              {busy ? "Translating…" : `Translate to ${languageName(lang)}`}
            </button>
          )}
        </div>
        <div className="actions">
          <button className="btn small" onClick={() => window.print()}>
            🖨️ Print
          </button>
          <button className="btn small danger" onClick={remove}>
            Delete
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {videoUrl && (
        <video ref={video} src={videoUrl} controls className="no-print" style={{ marginTop: 20, borderRadius: 16, maxHeight: 360 }} />
      )}

      {(recipe.story || recipe.storyQuote) && (
        <section className="card story section" style={{ marginTop: 20 }}>
          {recipe.storyQuote && <blockquote>&ldquo;{recipe.storyQuote}&rdquo;</blockquote>}
          <p style={{ marginBottom: 8 }}>{t?.story || recipe.story}</p>
          {storyClip && (
            <button className="play no-print" disabled={!mediaReady} onClick={() => playRange(storyClip.start, storyClip.end)}>
              ▶ Hear {elder} tell it
            </button>
          )}
        </section>
      )}

      <div className="recipe-layout section" style={{ marginTop: 20 }}>
        <section className="card">
          <h2>Ingredients</h2>
          {usesKatori && (
            <p className="notice small">
              Measured with {elder}&apos;s own katori ({katoriMl} ml). Change it in Settings.
            </p>
          )}
          {recipe.ingredients.map((ing, i) => (
            <div key={i} className="ingredient">
              <div className="row">
                <strong>{t?.ingredients[i] || ing.name}</strong>
                <span className="amount">
                  {estimateLabel(ing)}
                  {ing.isEstimate && ing.min != null && <span className="estimate">estimate</span>}
                </span>
              </div>
              <div className="said">
                {ing.original && <span lang={recipe.language}>{ing.original}</span>}
                {ing.quantityOriginal && <span>· {elder} said &ldquo;{ing.quantityOriginal}&rdquo;</span>}
              </div>
              {ing.substitutes.length > 0 && <div className="muted small">Swap: {ing.substitutes.join(", ")}</div>}
              {ing.note && <div className="muted small">{ing.note}</div>}
            </div>
          ))}
        </section>

        <section className="card">
          <h2>Steps</h2>
          <ol className="steps">
            {recipe.steps.map((step, i) => {
              const text = stepText(recipe, i, lang);
              return (
                <li key={i} className="step">
                  <span className="num">{i + 1}</span>
                  <div>
                    <strong>{text.instruction}</strong>
                    {text.sensoryCue ? (
                      <div className="cue">
                        <span>{SENSE_ICON[step.cueSense] ?? "👀"}</span>
                        <span>{text.sensoryCue}</span>
                      </div>
                    ) : (
                      <div className="cue missing">
                        <span>❔</span>
                        <span>{elder} didn&apos;t say how to tell this step is done.</span>
                      </div>
                    )}
                    <div className="said">
                      {step.originalQuote && <span lang={recipe.language}>&ldquo;{step.originalQuote}&rdquo;</span>}
                      {step.clipStart != null && (
                        <button
                          className="play no-print"
                          disabled={!mediaReady}
                          onClick={() => playRange(step.clipStart, step.clipEnd)}
                        >
                          ▶ {elder}
                        </button>
                      )}
                      {step.timerSeconds && <span className="chip">⏱️ {formatClock(step.timerSeconds)}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      {(recipe.missing.length > 0 || recipe.tips.length > 0) && (
        <div className="two-col section" style={{ marginTop: 20 }}>
          {recipe.missing.length > 0 && (
            <section className="card">
              <h3>Ask {elder} next time</h3>
              <ul>
                {recipe.missing.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </section>
          )}
          {recipe.tips.length > 0 && (
            <section className="card">
              <h3>{elder}&apos;s tips</h3>
              <ul>
                {recipe.tips.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {recipe.segments.length > 0 && (
        <details className="card section no-print" style={{ marginTop: 20 }}>
          <summary>Full transcript ({recipe.segments.length} lines)</summary>
          {voices.length > 1 && (
            <label className="field" style={{ margin: "12px 0", flexDirection: "row", alignItems: "center" }}>
              Which voice is {elder}?
              <select value={recipe.elderSpeaker ?? ""} onChange={(e) => setElderSpeaker(e.target.value)} style={{ width: "auto" }}>
                {voices.map((v) => (
                  <option key={v} value={v}>
                    Speaker {v}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="transcript" lang={recipe.language}>
            {recipe.segments.map((s, i) => (
              <p key={i}>
                <span className="who">{s.speaker === recipe.elderSpeaker ? elder : `Speaker ${s.speaker}`}</span>
                {s.end > s.start && <span className="muted small">{formatClock(s.start)} </span>}
                {s.text}
              </p>
            ))}
          </div>
        </details>
      )}

      {recipe.diaryText && (
        <details className="card section no-print" style={{ marginTop: 20 }}>
          <summary>The diary page</summary>
          {diaryUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={diaryUrl} alt="Diary page" style={{ maxHeight: 400, borderRadius: 12, margin: "12px 0" }} />
          )}
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{recipe.diaryText}</pre>
        </details>
      )}
    </article>
  );
}
