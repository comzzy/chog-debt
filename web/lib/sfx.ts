"use client";
// Tiny cartoon sound effects made with the Web Audio API. No audio files.
export type Sfx = "pop" | "boing" | "chaching" | "womp" | "whistle" | "stamp" | "fanfare" | "shield" | "click";

const KEY = "chogdebt:muted";
let ctx: AudioContext | null = null;
const listeners = new Set<(m: boolean) => void>();

export function isMuted() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(KEY) === "1";
}
export function setMuted(m: boolean) {
  localStorage.setItem(KEY, m ? "1" : "0");
  listeners.forEach((f) => f(m));
}
export function onMuteChange(f: (m: boolean) => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}

function ac() {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

const VOL = 0.08;

function tone(type: OscillatorType, f0: number, f1: number, start: number, dur: number, vol = VOL) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime + start;
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(start: number, dur: number, vol = VOL) {
  const c = ac();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = vol;
  s.buffer = buf;
  s.connect(g).connect(c.destination);
  s.start(c.currentTime + start);
}

export function play(name: Sfx) {
  if (typeof window === "undefined" || isMuted()) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && name === "click") return;
  try {
    switch (name) {
      case "pop": // wrote something down
        tone("sine", 400, 1200, 0, 0.08);
        tone("triangle", 900, 1500, 0.06, 0.07, VOL * 0.6);
        break;
      case "boing": // accepted
        tone("sine", 180, 520, 0, 0.12);
        tone("sine", 520, 260, 0.12, 0.18);
        tone("sine", 260, 400, 0.3, 0.12, VOL * 0.6);
        break;
      case "chaching": // money moved
        noise(0, 0.05, VOL * 0.7);
        tone("square", 1318, 1318, 0.06, 0.09, VOL * 0.5);
        tone("square", 1760, 1760, 0.14, 0.25, VOL * 0.5);
        tone("triangle", 2637, 2637, 0.14, 0.25, VOL * 0.4);
        break;
      case "womp": // default
        [392, 370, 349, 294].forEach((f, i) => tone("sawtooth", f, f * (i === 3 ? 0.85 : 0.98), i * 0.28, i === 3 ? 0.6 : 0.25, VOL * 0.6));
        break;
      case "whistle": // called in
        tone("sine", 900, 2200, 0, 0.18);
        tone("sine", 2200, 1200, 0.2, 0.22);
        break;
      case "stamp": // listed for sale / cancelled
        noise(0, 0.07, VOL * 1.2);
        tone("sine", 140, 60, 0, 0.12);
        break;
      case "shield": // vouched
        tone("triangle", 523, 523, 0, 0.1);
        tone("triangle", 784, 784, 0.1, 0.18);
        break;
      case "fanfare": // badge
        [523, 659, 784, 1047].forEach((f, i) => tone("square", f, f, i * 0.1, i === 3 ? 0.35 : 0.1, VOL * 0.45));
        break;
      case "click":
        tone("sine", 700, 500, 0, 0.04, VOL * 0.5);
        break;
    }
  } catch {
    /* audio not available */
  }
}

export const SFX_FOR: Record<string, Sfx> = {
  createIOU: "pop",
  accept: "boing",
  cancel: "stamp",
  callIn: "whistle",
  repay: "chaching",
  markDefault: "womp",
  listForSale: "stamp",
  cancelListing: "stamp",
  buyDebt: "chaching",
  vouch: "shield",
  withdrawVouch: "stamp",
  approve: "click",
};
