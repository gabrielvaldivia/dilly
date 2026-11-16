/* ------------------------------------------------------------------ */
/* Synthesized arcade sound effects (Web Audio, no assets) + haptics.  */
/* ------------------------------------------------------------------ */

const MUTE_KEY = "dilly:muted";
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch { /* storage blocked */ }

export function isMuted() { return muted; }
export function setMuted(next) {
  muted = next;
  try { localStorage.setItem(MUTE_KEY, next ? "1" : "0"); } catch { /* storage blocked */ }
}

let ctx = null;
let noiseBuf = null;
function audio() {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// iOS only lets audio start inside a user gesture, and some sounds fire from
// timers (the VS hit). Create/resume the context on every tap so it's ready.
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => { audio(); }, { capture: true, passive: true });
}

function tone(freq, { dur = 0.1, type = "square", vol = 0.05, at = 0, slideTo = null } = {}) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.12, at = 0, freq = 1200, q = 0.8 } = {}) {
  const ac = audio();
  if (!ac) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime + at;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  move: () => tone(1320, { dur: 0.04, vol: 0.025 }),
  tick: () => tone(1500, { dur: 0.018, vol: 0.012 }),
  select: (side = 1) => {
    const base = side === 1 ? 660 : 520;
    tone(base, { dur: 0.08, vol: 0.05 });
    tone(base * 1.5, { dur: 0.14, vol: 0.05, at: 0.07 });
  },
  deny: () => tone(140, { dur: 0.22, type: "sawtooth", vol: 0.05, slideTo: 90 }),
  vs: () => {
    noise({ dur: 0.5, vol: 0.22, freq: 500, q: 0.5 });
    tone(220, { dur: 0.7, type: "sawtooth", vol: 0.07, slideTo: 40 });
    tone(110, { dur: 0.9, type: "sine", vol: 0.16, slideTo: 30 });
  },
  fight: () => {
    [392, 523, 659].forEach((f, i) => tone(f, { dur: 0.22, type: "sawtooth", vol: 0.035, at: i * 0.06 }));
    noise({ dur: 0.25, vol: 0.1, freq: 2400 });
  },
  hit: (side = 1) => {
    noise({ dur: 0.09, vol: 0.18, freq: side === 1 ? 1800 : 1300, q: 1.2 });
    tone(side === 1 ? 260 : 200, { dur: 0.1, vol: 0.06, slideTo: 90 });
  },
  undo: () => tone(500, { dur: 0.08, type: "triangle", vol: 0.04, slideTo: 300 }),
  ko: () => {
    noise({ dur: 1.1, vol: 0.26, freq: 300, q: 0.4 });
    tone(160, { dur: 1.2, type: "sawtooth", vol: 0.08, slideTo: 30 });
    tone(80, { dur: 1.4, type: "sine", vol: 0.2, slideTo: 25 });
  },
  win: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, { dur: 0.16, type: "triangle", vol: 0.08, at: i * 0.11 }));
    [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, { dur: 0.22, type: "triangle", vol: 0.09, at: 0.52 + i * 0.095 }));
  },
  shutter: () => {
    noise({ dur: 0.05, vol: 0.2, freq: 3000, q: 0.7 });
    noise({ dur: 0.08, vol: 0.15, freq: 1800, q: 0.7, at: 0.07 });
  },
};

/** Haptic tick — vibrates where supported, silent no-op elsewhere. */
export function haptic(pattern = 8) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}
