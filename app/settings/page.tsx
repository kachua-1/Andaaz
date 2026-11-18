"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, KATORI_PHOTO_ID, loadSettings, saveSettings, type Settings } from "@/lib/client/settings";
import { clearEverything, getMedia, newId, saveMedia, saveRecipe } from "@/lib/client/store";
import { LANGUAGES } from "@/lib/languages";
import { sampleRecipe } from "@/lib/sample";

export default function SettingsPage() {
  const router = useRouter();
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [katoriUrl, setKatoriUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const katoriUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setS(loadSettings());
    let cancelled = false;
    getMedia(KATORI_PHOTO_ID)
      .then((b) => {
        if (cancelled || !b) return;
        const url = URL.createObjectURL(b);
        katoriUrlRef.current = url;
        setKatoriUrl(url);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      if (katoriUrlRef.current) URL.revokeObjectURL(katoriUrlRef.current);
      katoriUrlRef.current = null;
    };
  }, []);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function setKatoriPhoto(file: File | undefined) {
    if (!file) return;
    try {
      await saveMedia(KATORI_PHOTO_ID, file);
      if (katoriUrlRef.current) URL.revokeObjectURL(katoriUrlRef.current);
      const url = URL.createObjectURL(file);
      katoriUrlRef.current = url;
      setKatoriUrl(url);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function save() {
    saveSettings({ ...s, katoriMl: Math.max(20, Math.min(1000, Number(s.katoriMl) || 150)) });
    setSaved(true);
  }

  async function addSample() {
    try {
      const id = newId();
      await saveRecipe(sampleRecipe(id));
      router.push(`/recipe/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function wipe() {
    if (!confirm("Delete every recipe and recording saved in this browser? This can't be undone.")) return;
    try {
      await clearEverything();
      if (katoriUrlRef.current) URL.revokeObjectURL(katoriUrlRef.current);
      katoriUrlRef.current = null;
      setKatoriUrl(null);
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <p className="eyebrow">Settings</p>
      <h1>Your family</h1>
      {error && <p className="error">{error}</p>}

      <div className="card form-grid">
        <label className="field">
          Family name
          <input value={s.familyName} onChange={(e) => update("familyName", e.target.value)} />
        </label>
        <label className="field">
          Who usually teaches?
          <input value={s.elderName} onChange={(e) => update("elderName", e.target.value)} placeholder="Dadi, Nani, Dadu…" />
        </label>
        <label className="field">
          Their language
          <select value={s.elderLanguage} onChange={(e) => update("elderLanguage", e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} · {l.native}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Learner&apos;s language
          <select value={s.learnerLanguage} onChange={(e) => update("learnerLanguage", e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} · {l.native}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Learner&apos;s city (for ingredient swaps)
          <input value={s.learnerCity} onChange={(e) => update("learnerCity", e.target.value)} placeholder="Bengaluru, Toronto…" />
        </label>
      </div>

      <section className="card section" style={{ marginTop: 20 }}>
        <h2>Calibrate {s.elderName}&apos;s katori</h2>
        <p className="muted">
          &ldquo;Ek katori&rdquo; means {s.elderName}&apos;s katori, not a standard cup. Fill it to the brim with water,
          pour that into a measuring jug, and enter the amount. Andaaz uses it as a real unit for every recipe.
        </p>
        <div className="form-grid">
          <label className="field">
            Katori holds (ml)
            <input
              type="number"
              min={20}
              max={1000}
              value={s.katoriMl}
              onChange={(e) => update("katoriMl", Number(e.target.value))}
            />
          </label>
          <label className="field">
            Photo of the katori (kept on this device)
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setKatoriPhoto(e.target.files?.[0])} />
          </label>
        </div>
        {katoriUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={katoriUrl} alt={`${s.elderName}'s katori`} style={{ maxHeight: 180, borderRadius: 12, marginTop: 12 }} />
        )}
      </section>

      <section className="card section" style={{ marginTop: 20 }}>
        <h2>Access code</h2>
        <p className="muted">
          If whoever deployed this Andaaz set an <code>ACCESS_CODE</code>, enter it here so the app can use Sarvam.
        </p>
        <label className="field">
          Access code
          <input type="password" value={s.accessCode} onChange={(e) => update("accessCode", e.target.value)} autoComplete="off" />
        </label>
      </section>

      <div className="actions section" style={{ marginTop: 20 }}>
        <button className="btn primary" onClick={save}>
          Save settings
        </button>
        {saved && <span className="chip leaf">Saved ✓</span>}
        <button className="btn" onClick={addSample}>
          Add the sample recipe
        </button>
        <button className="btn danger" onClick={wipe}>
          Delete everything on this device
        </button>
      </div>
    </div>
  );
}
