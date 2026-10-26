"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { postForAudio, postForm, postJson } from "@/lib/client/api";
import { chime, ClipPlayer, playBlob, Recorder, stopSpeaking, toWavChunks } from "@/lib/client/audio";
import { loadSettings } from "@/lib/client/settings";
import { getMedia, getRecipe } from "@/lib/client/store";
import { ensureTranslation, stepText } from "@/lib/client/translate";
import { canSpeak, languageName, LANGUAGES } from "@/lib/languages";
import { clipRange, estimateLabel, formatClock, SENSE_ICON } from "@/lib/recipe";
import type { Recipe } from "@/lib/types";

type Nav = "next" | "prev" | "repeat";

// Short spoken commands are handled locally (no credits); anything else goes to /api/ask.
const COMMANDS: [Nav, RegExp][] = [
  ["next", /\b(next|agla|agle|aage|aagey|age)\b|अगला|अगले|आगे|পরের|அடுத்த|తరువాత|ಮುಂದ/i],
  ["prev", /\b(back|previous|pichla|pichhla|peeche|piche)\b|पिछला|पीछे|আগের|முந்தைய/i],
  ["repeat", /\b(repeat|again|dobara|dubara|phir se|fir se)\b|दोबारा|फिर से|फिरसे|আবার|மீண்டும்/i],
];

function matchCommand(text: string): Nav | null {
  if (text.trim().split(/\s+/).length > 6) return null;
  return COMMANDS.find(([, re]) => re.test(text))?.[0] ?? null;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function CookPage() {
  return (
    <Suspense>
      <Cook />
    </Suspense>
  );
}

function Cook() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  const [lang, setLang] = useState(search.get("lang") || "en-IN");
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState<{ text: string; segment: number | null } | null>(null);
  const [timer, setTimer] = useState<{ total: number; left: number; running: boolean } | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const recipeRef = useRef<Recipe | null>(null);
  const mediaReadyRef = useRef(false);
  const idxRef = useRef(0);
  const runId = useRef(0);
  const player = useRef<ClipPlayer | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const narrations = useRef(new Map<string, Blob>());
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<Recorder | null>(null);

  useEffect(() => {
    if (!search.get("lang")) setLang(loadSettings().learnerLanguage);
    let url: string | null = null;
    getRecipe(id).then(async (r) => {
      recipeRef.current = r ?? null;
      setRecipe(r ?? null);
      if (!r?.mediaId) return;
      const blob = await getMedia(r.mediaId);
      if (!blob) return;
      const ready = () => {
        mediaReadyRef.current = true;
        setMediaReady(true);
      };
      if (r.mediaType?.startsWith("video")) {
        url = URL.createObjectURL(blob);
        setVideoUrl(url);
        ready();
      } else {
        player.current = new ClipPlayer();
        player.current.load(blob).then(ready, () => setError("This browser couldn't open the saved recording."));
      }
    });
    return () => {
      runId.current++;
      player.current?.close();
      stopSpeaking();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Count the timer down and chime when it ends.
  useEffect(() => {
    if (!timer?.running) return;
    const t = setInterval(() => {
      setTimer((prev) => (prev && prev.left > 0 ? { ...prev, left: prev.left - 1, running: prev.left > 1 } : prev));
    }, 1000);
    return () => clearInterval(t);
  }, [timer?.running]);

  useEffect(() => {
    if (timer && timer.left === 0 && timer.total > 0) {
      chime();
      setStatus("⏰ Time's up. Check the cue before moving on.");
    }
  }, [timer?.left, timer?.total]); // eslint-disable-line react-hooks/exhaustive-deps

  function stopAll() {
    player.current?.stop();
    stopSpeaking();
    video.current?.pause();
  }

  async function playClip(start: number, end: number) {
    const v = video.current;
    if (v) {
      v.currentTime = Math.max(0, start);
      await v.play().catch(() => undefined);
      await new Promise<void>((resolve) => {
        const check = () => {
          if (v.currentTime >= end || v.paused) {
            v.pause();
            v.removeEventListener("timeupdate", check);
            v.removeEventListener("pause", check);
            resolve();
          }
        };
        v.addEventListener("timeupdate", check);
        v.addEventListener("pause", check);
      });
    } else {
      await player.current?.play(start, end);
    }
  }

  async function speak(text: string) {
    if (!canSpeak(lang) || !text.trim()) return;
    const key = `${lang}:${text}`;
    let blob = narrations.current.get(key);
    if (!blob) {
      blob = await postForAudio("/api/tts", { text, language: lang, speaker: "kavya", pace: 0.95 });
      narrations.current.set(key, blob);
    }
    await playBlob(blob);
  }

  async function present(i: number) {
    const r = recipeRef.current;
    if (!r) return;
    const run = ++runId.current;
    stopAll();
    idxRef.current = i;
    setIdx(i);
    setAnswer(null);
    setHeard("");
    setError("");
    const step = r.steps[i];
    setTimer(step.timerSeconds ? { total: step.timerSeconds, left: step.timerSeconds, running: false } : null);
    try {
      if (step.clipStart != null && step.clipEnd != null && mediaReadyRef.current) {
        setStatus(`${r.elderName} is explaining…`);
        await playClip(step.clipStart, step.clipEnd);
        if (run !== runId.current) return;
      }
      if (canSpeak(lang)) {
        setStatus("Narrating…");
        const text = stepText(r, i, lang);
        await speak(`${text.instruction} ${text.sensoryCue}`.trim());
      }
    } catch (e) {
      if (run === runId.current) setError(message(e));
    }
    if (run === runId.current) setStatus("");
  }

  async function begin() {
    const r = recipeRef.current;
    if (!r) return;
    setError("");
    try {
      if (lang !== "en-IN" && !r.translations[lang]) {
        setStatus(`Translating into ${languageName(lang)} with Sarvam Translate…`);
        const updated = await ensureTranslation(r, lang);
        recipeRef.current = updated;
        setRecipe(updated);
      }
      setStarted(true);
      setFinished(false);
      void present(0);
    } catch (e) {
      setError(message(e));
      setStatus("");
    }
  }

  function navigate(cmd: Nav) {
    const r = recipeRef.current;
    if (!r) return;
    const i = idxRef.current;
    if (cmd === "repeat") return void present(i);
    if (cmd === "prev") return void present(Math.max(0, i - 1));
    if (i < r.steps.length - 1) return void present(i + 1);
    runId.current++;
    stopAll();
    setFinished(true);
    setStatus("");
  }

  async function toggleMic() {
    if (listening) return stopListening();
    runId.current++;
    stopAll();
    try {
      stream.current ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      recorder.current = new Recorder(stream.current);
      recorder.current.start();
      setListening(true);
      setHeard("");
      setAnswer(null);
      setError("");
      setStatus("Listening… tap again when you're done.");
    } catch {
      setError("Andaaz needs the microphone for voice commands. Allow it in the address bar.");
    }
  }

  async function stopListening() {
    const blob = await recorder.current?.stop();
    recorder.current = null;
    setListening(false);
    if (!blob) return;
    setStatus("Understanding…");
    try {
      const [chunk] = await toWavChunks(blob, 25);
      if (!chunk) {
        setStatus("Didn't hear anything. Tap the mic and try again.");
        return;
      }
      const form = new FormData();
      form.append("file", chunk, "command.wav");
      form.append("language", "unknown");
      const { transcript } = await postForm<{ transcript: string }>("/api/stt", form);
      setHeard(transcript);
      if (!transcript.trim()) return setStatus("Didn't catch that. Try again?");
      await handleUtterance(transcript);
    } catch (e) {
      setError(message(e));
      setStatus("");
    }
  }

  async function handleUtterance(text: string) {
    const cmd = matchCommand(text);
    if (cmd) return navigate(cmd);
    const r = recipeRef.current;
    if (!r) return;
    setStatus(`Checking what ${r.elderName} said…`);
    const res = await postJson<{ intent: string; answer: string; segment: number | null }>("/api/ask", {
      question: text,
      language: lang,
      elderName: r.elderName,
      title: r.title,
      currentStep: idxRef.current,
      steps: r.steps.map((_, i) => stepText(r, i, "en-IN")),
      ingredients: r.ingredients.map((i) => `${i.name}: ${i.quantityOriginal || estimateLabel(i)}`),
      segments: r.segments,
      elderSpeaker: r.elderSpeaker,
      diaryText: r.diaryText,
    });
    if (res.intent === "next" || res.intent === "prev" || res.intent === "repeat") return navigate(res.intent);

    setAnswer({ text: res.answer, segment: res.segment });
    const run = ++runId.current;
    setStatus("");
    await speak(res.answer);
    if (run !== runId.current) return;
    const seg = res.segment != null ? r.segments[res.segment] : null;
    if (seg && seg.end > seg.start && mediaReadyRef.current) {
      setStatus(`${r.elderName}, in their own words…`);
      await playClip(Math.max(0, seg.start - 0.2), seg.end + 0.3);
    }
    if (run === runId.current) setStatus("");
  }

  // Keyboard: → next, ← back, R repeat, Space for the mic.
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") navigate("next");
      else if (e.key === "ArrowLeft") navigate("prev");
      else if (e.key.toLowerCase() === "r") navigate("repeat");
      else if (e.key === " ") {
        e.preventDefault();
        void toggleMic();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (recipe === undefined) return <p className="muted">Opening the recipe…</p>;
  if (recipe === null) {
    return (
      <div className="card center">
        <p>This recipe isn&apos;t on this device.</p>
        <Link className="btn" href="/">
          Back to the cookbook
        </Link>
      </div>
    );
  }

  const elder = recipe.elderName;
  const step = recipe.steps[idx];
  const text = step ? stepText(recipe, idx, lang) : null;
  const answerSeg = answer?.segment != null ? recipe.segments[answer.segment] : null;
  const storyClip = clipRange(recipe.storySegments, recipe.segments, recipe.elderSpeaker);

  return (
    <div className="cook">
      <Link href={`/recipe/${recipe.id}`} className="small">
        ← {recipe.title}
      </Link>
      {videoUrl && <video ref={video} src={videoUrl} playsInline style={{ width: "100%", borderRadius: 16, marginTop: 12 }} />}

      {!started ? (
        <div className="card center" style={{ marginTop: 16 }}>
          {recipe.titleOriginal && <p className="original" style={{ fontSize: "2.2rem", margin: 0, color: "var(--accent)" }}>{recipe.titleOriginal}</p>}
          <h1 style={{ margin: 0 }}>Cook along with {elder}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {recipe.steps.length} steps.{" "}
            {recipe.mediaId ? `Each step plays ${elder}'s own voice, then narration.` : "Each step is narrated."} Hands
            busy? Tap the mic (or press Space) and say &ldquo;agla step&rdquo;, &ldquo;repeat&rdquo; or ask &ldquo;how do
            I know it&apos;s done?&rdquo;
          </p>
          <label className="field" style={{ flexDirection: "row", alignItems: "center" }}>
            Narrate in
            <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ width: "auto" }}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                  {l.tts ? "" : " (text only)"}
                </option>
              ))}
            </select>
          </label>
          {recipe.mediaId && !mediaReady && <p className="muted small">Loading {elder}&apos;s recording…</p>}
          <button className="btn primary" onClick={begin} disabled={Boolean(status)}>
            {status || "👩‍🍳 Start cooking"}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      ) : finished ? (
        <div className="card center" style={{ marginTop: 16 }}>
          <h1>🎉 Bas, ho gaya!</h1>
          <p className="lede">Your {recipe.title.toLowerCase()} is ready, just the way {elder} makes it.</p>
          <div className="actions" style={{ justifyContent: "center" }}>
            {storyClip && mediaReady && (
              <button className="btn" onClick={() => playClip(storyClip.start, storyClip.end)}>
                ▶ Hear {elder}&apos;s story
              </button>
            )}
            <button className="btn" onClick={() => present(0)}>
              Start again
            </button>
            <Link className="btn primary" href="/">
              Back to the cookbook
            </Link>
          </div>
        </div>
      ) : (
        step &&
        text && (
          <>
            <div className="progress" aria-hidden>
              <div style={{ width: `${((idx + 1) / recipe.steps.length) * 100}%` }} />
            </div>
            <section className="card cook-step">
              <p className="eyebrow">
                Step {idx + 1} of {recipe.steps.length}
              </p>
              <h2>{text.instruction}</h2>
              {text.sensoryCue ? (
                <div className="cue" style={{ fontSize: "1.1rem" }}>
                  <span>{SENSE_ICON[step.cueSense] ?? "👀"}</span>
                  <span>
                    <strong>How to know: </strong>
                    {text.sensoryCue}
                  </span>
                </div>
              ) : (
                <div className="cue missing">
                  <span>❔</span>
                  <span>{elder} didn&apos;t describe a cue for this step.</span>
                </div>
              )}
              {step.originalQuote && (
                <p className="said" lang={recipe.language} style={{ marginTop: 8 }}>
                  {elder}: &ldquo;{step.originalQuote}&rdquo;
                </p>
              )}
              {timer && (
                <div className="timer">
                  <span className="clock">{formatClock(timer.left)}</span>
                  <span className="muted small">from {elder}&apos;s timing</span>
                  <div className="actions">
                    <button className="btn small" onClick={() => setTimer({ ...timer, running: !timer.running })} disabled={timer.left === 0}>
                      {timer.running ? "Pause" : "Start timer"}
                    </button>
                    <button className="btn small ghost" onClick={() => setTimer({ ...timer, left: timer.total, running: false })}>
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </section>

            <div className="cook-controls">
              <button className="btn" onClick={() => navigate("prev")} disabled={idx === 0}>
                ◀ Back
              </button>
              <button className="btn" onClick={() => navigate("repeat")}>
                ↻ Repeat
              </button>
              <button className={`mic${listening ? " live" : ""}`} onClick={toggleMic}>
                <span className="icon">{listening ? "■" : "🎙️"}</span>
                {listening ? "Done" : "Ask or say “agla”"}
              </button>
              <button className="btn primary" onClick={() => navigate("next")}>
                {idx === recipe.steps.length - 1 ? "Finish ✓" : "Next ▶"}
              </button>
            </div>

            <p className="center muted small" style={{ minHeight: 24 }}>
              {status ||
                (heard ? (
                  <span>
                    You said: &ldquo;{heard}&rdquo;
                  </span>
                ) : (
                  <span>
                    <span className="kbd">←</span> <span className="kbd">→</span> steps · <span className="kbd">R</span>{" "}
                    repeat · <span className="kbd">Space</span> mic
                  </span>
                ))}
            </p>
            {heard && status && <p className="center muted small">You said: &ldquo;{heard}&rdquo;</p>}
            {error && <p className="error">{error}</p>}

            {answer && (
              <section className="card answer">
                <p className="eyebrow">From {elder}&apos;s recording</p>
                <p style={{ fontSize: "1.1rem" }}>{answer.text}</p>
                {answerSeg && (
                  <p className="said" lang={recipe.language}>
                    {elder}: &ldquo;{answerSeg.text}&rdquo;
                    {answerSeg.end > answerSeg.start && mediaReady && (
                      <button className="play" onClick={() => playClip(Math.max(0, answerSeg.start - 0.2), answerSeg.end + 0.3)}>
                        ▶ Hear it
                      </button>
                    )}
                  </p>
                )}
              </section>
            )}

            <details className="card section" style={{ marginTop: 16 }}>
              <summary>Ingredients</summary>
              <ul>
                {recipe.ingredients.map((ing, i) => (
                  <li key={i}>
                    <strong>{recipe.translations[lang]?.ingredients[i] || ing.name}</strong>: {estimateLabel(ing)}
                    {ing.quantityOriginal && <span className="muted"> ({elder}: &ldquo;{ing.quantityOriginal}&rdquo;)</span>}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )
      )}
    </div>
  );
}
