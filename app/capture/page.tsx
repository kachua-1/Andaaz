"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { getJson, poll, postForAudio, postForm, postJson } from "@/lib/client/api";
import { playBlob, Recorder, stopSpeaking, toWavChunks } from "@/lib/client/audio";
import { decodeRecipe, recipeFromRecording } from "@/lib/client/pipeline";
import { DEFAULT_SETTINGS, loadSettings, type Settings } from "@/lib/client/settings";
import { newId, saveMedia, saveRecipe } from "@/lib/client/store";
import { canSpeak, LANGUAGES } from "@/lib/languages";
import { formatClock } from "@/lib/recipe";
import type { Turn } from "@/lib/types";

type Mode = "interview" | "upload" | "diary";

interface Common {
  elderName: string;
  language: string;
  dish: string;
  settings: Settings;
  busy: boolean;
  /** Runs a pipeline that ends in a saved recipe, showing progress and errors. */
  run: (job: (onStage: (s: string) => void) => Promise<string>) => Promise<void>;
  onError: (message: string) => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function CapturePage() {
  return (
    <Suspense>
      <Capture />
    </Suspense>
  );
}

function Capture() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get("mode");
  const [mode, setMode] = useState<Mode>(initial === "upload" || initial === "diary" ? initial : "interview");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [elderName, setElderName] = useState(DEFAULT_SETTINGS.elderName);
  const [language, setLanguage] = useState(DEFAULT_SETTINGS.elderLanguage);
  const [dish, setDish] = useState("");
  const [stages, setStages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setElderName(s.elderName);
    setLanguage(s.elderLanguage);
  }, []);

  const common: Common = {
    elderName: elderName.trim() || "Dadi",
    language,
    dish: dish.trim(),
    settings,
    busy,
    onError: setError,
    run: async (job) => {
      setBusy(true);
      setError("");
      setStages([]);
      try {
        const id = await job((s) => setStages((prev) => [...prev, s]));
        setStages((prev) => [...prev, "Saved to the family cookbook"]);
        router.push(`/recipe/${id}`);
      } catch (e) {
        setError(message(e));
        setBusy(false);
      }
    },
  };

  return (
    <div>
      <p className="eyebrow">Capture</p>
      <h1>Learn a recipe from {common.elderName}</h1>

      <div className="tabs" role="tablist">
        {(
          [
            ["interview", "🎙️ Live interview"],
            ["upload", "⬆️ Upload a recording"],
            ["diary", "📖 Diary page"],
          ] as const
        ).map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} disabled={busy}>
            {label}
          </button>
        ))}
      </div>

      <div className="card form-grid">
        <label className="field">
          Who is teaching?
          <input value={elderName} onChange={(e) => setElderName(e.target.value)} placeholder="Dadi, Nani, Dadu…" />
        </label>
        <label className="field">
          Their language
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} · {l.native}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Dish (optional)
          <input value={dish} onChange={(e) => setDish(e.target.value)} placeholder="e.g. Holi gujiya" />
        </label>
      </div>

      <div className="section" style={{ marginTop: 20 }}>
        {mode === "interview" && <Interview {...common} />}
        {mode === "upload" && <Upload {...common} />}
        {mode === "diary" && <Diary {...common} />}
      </div>

      {(stages.length > 0 || error) && (
        <div className="card section" style={{ marginTop: 20 }}>
          <ul className="stages">
            {stages.map((s, i) => (
              <li key={i}>
                {i === stages.length - 1 && busy && !error ? <span className="spinner" /> : <span>✅</span>}
                {s}
              </li>
            ))}
          </ul>
          {error && (
            <p className="error" style={{ marginTop: stages.length ? 12 : 0, marginBottom: 0 }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type Phase = "idle" | "thinking" | "speaking" | "waiting" | "recording" | "transcribing" | "complete";

function Interview(p: Common) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const turnsRef = useRef<Turn[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<Recorder | null>(null);
  const answerRef = useRef<Recorder | null>(null);
  const questionAudio = useRef<Blob | null>(null);
  const startedAt = useRef(0);
  const chatEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => chatEnd.current?.scrollIntoView({ block: "nearest" }), [turns]);

  useEffect(() => {
    if (phase === "idle") return;
    const t = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(
    () => () => {
      stopSpeaking();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  function setTurnList(next: Turn[]) {
    turnsRef.current = next;
    setTurns(next);
  }

  async function start() {
    p.onError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      sessionRef.current = new Recorder(stream);
      sessionRef.current.start();
      startedAt.current = Date.now();
      await ask();
    } catch (e) {
      p.onError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Andaaz needs the microphone. Allow it in the browser's address bar and try again."
          : message(e),
      );
      setPhase("idle");
    }
  }

  async function ask() {
    setPhase("thinking");
    try {
      const { question, done } = await postJson<{ question: string; done: boolean }>("/api/interviewer", {
        language: p.language,
        elderName: p.elderName,
        dish: p.dish,
        turns: turnsRef.current,
      });
      setTurnList([...turnsRef.current, { who: "interviewer", text: question }]);
      setPhase("speaking");
      if (canSpeak(p.language)) {
        try {
          questionAudio.current = await postForAudio("/api/tts", {
            text: question,
            language: p.language,
            speaker: "priya",
            pace: 0.9,
          });
          await playBlob(questionAudio.current);
        } catch {
          questionAudio.current = null; // the question is still shown as text
        }
      }
      setPhase(done ? "complete" : "waiting");
    } catch (e) {
      p.onError(message(e));
      setPhase("waiting");
    }
  }

  function startAnswer() {
    if (!streamRef.current) return;
    stopSpeaking();
    p.onError("");
    answerRef.current = new Recorder(streamRef.current);
    answerRef.current.start();
    setPhase("recording");
  }

  async function stopAnswer() {
    const blob = await answerRef.current?.stop();
    answerRef.current = null;
    if (!blob) return;
    setPhase("transcribing");
    try {
      const texts: string[] = [];
      for (const chunk of await toWavChunks(blob)) {
        const form = new FormData();
        form.append("file", chunk, "answer.wav");
        form.append("language", p.language);
        const r = await postForm<{ transcript: string }>("/api/stt", form);
        if (r.transcript?.trim()) texts.push(r.transcript.trim());
      }
      const text = texts.join(" ");
      if (!text) {
        p.onError(`Didn't catch that. Ask ${p.elderName} to answer again, a little closer to the phone.`);
        setPhase("waiting");
        return;
      }
      setTurnList([...turnsRef.current, { who: "elder", text }]);
      await ask();
    } catch (e) {
      p.onError(message(e));
      setPhase("waiting");
    }
  }

  async function finish() {
    stopSpeaking();
    if (answerRef.current) await answerRef.current.stop();
    const media = await sessionRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (!media) return;
    const fallbackSegments = turnsRef.current.map((t) => ({
      speaker: t.who === "elder" ? "0" : "1",
      text: t.text,
      start: 0,
      end: 0,
    }));
    await p.run((onStage) =>
      recipeFromRecording(media, {
        source: "interview",
        language: p.language,
        speakers: 2,
        elderName: p.elderName,
        katoriMl: p.settings.katoriMl,
        learnerCity: p.settings.learnerCity,
        dishHint: p.dish,
        fallbackSegments,
        onStage,
      }),
    );
  }

  const answered = turns.some((t) => t.who === "elder");

  if (phase === "idle") {
    return (
      <div className="card center">
        <p className="lede" style={{ margin: 0 }}>
          Prop the phone up near {p.elderName} while they cook or sit and chat. Andaaz asks one question at a time, out
          loud, in their language. Tap the big button while {p.elderName} answers.
        </p>
        <p className="muted small" style={{ margin: 0 }}>
          The whole session is recorded so each step can later play {p.elderName}&apos;s own voice.
        </p>
        <button className="btn primary" onClick={start} disabled={p.busy}>
          🎙️ Start the session
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <span className="small">
          {streamRef.current && <span className="rec-dot" />}
          {streamRef.current ? `Recording the session · ${formatClock(elapsed)}` : "Session ended"}
        </span>
        {answered && (
          <button className="btn primary small" onClick={finish} disabled={p.busy || phase === "transcribing"}>
            ✅ Finish &amp; make the recipe
          </button>
        )}
      </div>

      <div className="chat">
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.who}`}>
            <small>{t.who === "interviewer" ? "Andaaz asks" : p.elderName}</small>
            {t.text}
          </div>
        ))}
        <div ref={chatEnd} />
      </div>

      {streamRef.current && (
        <div className="center">
          {phase === "thinking" && (
            <p className="muted">
              <span className="spinner" style={{ display: "inline-block", verticalAlign: "middle" }} /> Thinking of
              the next question…
            </p>
          )}
          {phase === "speaking" && (
            <button className="btn small" onClick={() => stopSpeaking()}>
              ⏭ Skip the spoken question
            </button>
          )}
          {(phase === "waiting" || phase === "complete") && (
            <>
              {phase === "complete" && (
                <p className="notice small" style={{ margin: 0 }}>
                  The interviewer has what it needs. Finish now, or keep going if {p.elderName} has more to share.
                </p>
              )}
              <button className="mic" onClick={startAnswer} disabled={p.busy}>
                <span className="icon">🎙️</span>
                Tap while {p.elderName} answers
              </button>
              <div className="actions" style={{ justifyContent: "center" }}>
                {questionAudio.current && (
                  <button className="btn small" onClick={() => questionAudio.current && playBlob(questionAudio.current)}>
                    🔁 Repeat the question
                  </button>
                )}
                <button className="btn small" onClick={ask}>
                  ↪ Ask something else
                </button>
              </div>
            </>
          )}
          {phase === "recording" && (
            <button className="mic live" onClick={stopAnswer}>
              <span className="icon">■</span>
              Done answering
            </button>
          )}
          {phase === "transcribing" && (
            <p className="muted">
              <span className="spinner" style={{ display: "inline-block", verticalAlign: "middle" }} /> Writing down
              what {p.elderName} said…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Upload(p: Common) {
  const [file, setFile] = useState<File | null>(null);
  const [speakers, setSpeakers] = useState(2);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="card">
      <p>
        Already have a recording or video of {p.elderName} explaining a recipe? Upload it. Sarvam&apos;s batch speech
        API separates the voices and timestamps every line, so each step can play {p.elderName}&apos;s own words.
      </p>
      <div className="form-grid">
        <label className="field">
          Recording (audio or video)
          <input type="file" accept="audio/*,video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="field">
          How many people talk in it?
          <select value={speakers} onChange={(e) => setSpeakers(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? `Only ${p.elderName}` : `${n} people`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {preview && file && (
        <div style={{ marginTop: 14 }}>
          {file.type.startsWith("video") ? (
            <video src={preview} controls style={{ maxHeight: 260, borderRadius: 12 }} />
          ) : (
            <audio src={preview} controls style={{ width: "100%" }} />
          )}
        </div>
      )}
      <div className="actions" style={{ marginTop: 16 }}>
        <button
          className="btn primary"
          disabled={!file || p.busy}
          onClick={() =>
            file &&
            p.run((onStage) =>
              recipeFromRecording(file, {
                source: "recording",
                language: p.language,
                speakers,
                elderName: p.elderName,
                katoriMl: p.settings.katoriMl,
                learnerCity: p.settings.learnerCity,
                dishHint: p.dish,
                onStage,
              }),
            )
          }
        >
          Make the recipe
        </button>
        <span className="muted small">Long recordings take a few minutes to transcribe.</span>
      </div>
    </div>
  );
}

function Diary(p: Common) {
  const [file, setFile] = useState<File | null>(null);
  const [contentType, setContentType] = useState("handwritten");
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image")) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function read() {
    if (!file) return;
    setReading(true);
    p.onError("");
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("language", p.language);
      form.append("contentType", contentType);
      const { jobId } = await postForm<{ jobId: string }>("/api/digitise", form);
      const done = await poll(
        () => getJson<{ status: string; markdown?: string; error?: string }>(`/api/digitise?jobId=${encodeURIComponent(jobId)}`),
        (r) => ["completed", "partially_completed", "failed", "rejected"].includes(r.status),
        { intervalMs: 3000, timeoutMs: 5 * 60_000 },
      );
      if (done.error) throw new Error(done.error);
      setText(done.markdown?.trim() || "");
      if (!done.markdown?.trim()) p.onError("Sarvam Vision couldn't find any text on this page.");
    } catch (e) {
      p.onError(message(e));
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="card">
      <p>
        Photograph a page from an old recipe diary. Sarvam Vision reads it, including handwriting, in 22 Indian
        languages plus English. Check what it read before turning it into a recipe: handwriting is hard.
      </p>
      <div className="form-grid">
        <label className="field">
          Diary page (photo or PDF)
          <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="field">
          The page is
          <select value={contentType} onChange={(e) => setContentType(e.target.value)}>
            <option value="handwritten">Handwritten</option>
            <option value="mixed">Mixed (handwritten and printed)</option>
            <option value="printed">Printed</option>
          </select>
        </label>
      </div>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Diary page" style={{ maxHeight: 320, borderRadius: 12, marginTop: 14 }} />
      )}
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn" disabled={!file || reading || p.busy} onClick={read}>
          {reading ? "Reading the page…" : "1 · Read the page with Sarvam Vision"}
        </button>
      </div>
      {text && (
        <>
          <label className="field" style={{ marginTop: 16 }}>
            What Sarvam Vision read (fix anything it got wrong)
            <textarea value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="actions" style={{ marginTop: 12 }}>
            <button
              className="btn primary"
              disabled={p.busy}
              onClick={() =>
                p.run(async (onStage) => {
                  onStage("The Andaaz engine is decoding the diary page");
                  const decoded = await decodeRecipe({
                    source: "diary",
                    language: p.language,
                    elderName: p.elderName,
                    katoriMl: p.settings.katoriMl,
                    learnerCity: p.settings.learnerCity,
                    dishHint: p.dish,
                    text,
                  });
                  const diaryImageId = file ? newId() : null;
                  if (file && diaryImageId) await saveMedia(diaryImageId, file);
                  const id = newId();
                  await saveRecipe({
                    ...decoded,
                    id,
                    createdAt: Date.now(),
                    source: "diary",
                    language: p.language,
                    elderName: p.elderName,
                    segments: [],
                    elderSpeaker: null,
                    mediaId: null,
                    mediaType: null,
                    diaryImageId,
                    diaryText: text,
                    translations: {},
                  });
                  return id;
                })
              }
            >
              2 · Turn it into a recipe
            </button>
          </div>
        </>
      )}
    </div>
  );
}
