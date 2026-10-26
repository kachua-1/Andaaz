// Recording, chunking and playback helpers for the browser.

export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function extensionFor(type: string): string {
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return type.startsWith("video") ? "mp4" : "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("flac")) return "flac";
  return "webm";
}

/** Thin wrapper over MediaRecorder; low bitrate keeps long sessions small enough to upload. */
export class Recorder {
  private rec: MediaRecorder;
  private chunks: Blob[] = [];

  constructor(stream: MediaStream) {
    const mimeType = pickMimeType();
    this.rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
  }

  start(): void {
    this.chunks = [];
    this.rec.start(1000);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const finish = () => resolve(new Blob(this.chunks, { type: this.rec.mimeType || "audio/webm" }));
      if (this.rec.state === "inactive") return finish();
      this.rec.onstop = finish;
      this.rec.stop();
    });
  }
}

/**
 * Decodes a recording, downmixes to 16 kHz mono and splits it into WAV chunks short enough
 * for Sarvam's REST speech-to-text endpoint (under 30 s each).
 */
export async function toWavChunks(blob: Blob, maxSeconds = 25): Promise<Blob[]> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const rate = 16000;
    const length = Math.ceil(decoded.duration * rate);
    if (length < rate * 0.4) return [];
    const offline = new OfflineAudioContext(1, length, rate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const mono = (await offline.startRendering()).getChannelData(0);
    const size = maxSeconds * rate;
    const out: Blob[] = [];
    for (let i = 0; i < mono.length; i += size) {
      const part = mono.subarray(i, i + size);
      if (part.length > rate * 0.4) out.push(encodeWav(part, rate));
    }
    return out;
  } finally {
    void ctx.close();
  }
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const write = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  write(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  write(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Plays exact time ranges of a recording. Decoding once into an AudioBuffer gives precise
 * cuts even for MediaRecorder WebM files, which browsers can't seek reliably.
 */
export class ClipPlayer {
  private ctx: AudioContext;
  private buffer: AudioBuffer | null = null;
  private current: AudioBufferSourceNode | null = null;

  constructor() {
    try {
      this.ctx = new AudioContext({ sampleRate: 16000 });
    } catch {
      this.ctx = new AudioContext();
    }
  }

  async load(blob: Blob): Promise<void> {
    this.buffer = await this.ctx.decodeAudioData(await blob.arrayBuffer());
  }

  get ready(): boolean {
    return this.buffer !== null;
  }

  async play(start: number, end: number): Promise<void> {
    if (!this.buffer) return;
    this.stop();
    await this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.ctx.destination);
    this.current = src;
    const from = Math.max(0, Math.min(start, this.buffer.duration));
    const length = Math.max(0.2, Math.min(end, this.buffer.duration) - from);
    await new Promise<void>((resolve) => {
      src.onended = () => resolve();
      src.start(0, from, length);
    });
    if (this.current === src) this.current = null;
  }

  stop(): void {
    try {
      this.current?.stop();
    } catch {
      // already stopped
    }
    this.current = null;
  }

  close(): void {
    this.stop();
    void this.ctx.close();
  }
}

let speaking: HTMLAudioElement | null = null;

/** Plays a blob (e.g. a Bulbul narration) and resolves when it finishes or is stopped. */
export function playBlob(blob: Blob): Promise<void> {
  stopSpeaking();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  speaking = audio;
  return new Promise((resolve) => {
    const done = () => {
      URL.revokeObjectURL(url);
      if (speaking === audio) speaking = null;
      resolve();
    };
    audio.onended = done;
    audio.onpause = done;
    audio.onerror = done;
    audio.play().catch(done);
  });
}

export function stopSpeaking(): void {
  speaking?.pause();
  speaking = null;
}

/** A short two-tone chime for timers. */
export function chime(): void {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.35 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.35);
      osc.stop(ctx.currentTime + i * 0.35 + 0.32);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // no audio available
  }
}
