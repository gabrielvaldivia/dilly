import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Confetti } from "./components/Confetti";
import { VictoryBurst } from "./components/VictoryBurst";
import { pickVariant, buildCtx } from "./variants.js";

/* ------------------------------------------------------------------ */
/* Hosted data layer: the artifact's actions, backed by the shared    */
/* Vercel Blob API (/api/state, /api/games). The state is reshaped    */
/* to exactly what the artifact's getState returns: games newest      */
/* first with winner + names attached, plus head-to-head stats.       */
/* ------------------------------------------------------------------ */

async function apiFetch(path, options) {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function computeState(raw) {
  const games = [...raw.games].reverse().map((g) => ({
    id: g.id,
    p1Score: g.p1Score,
    p2Score: g.p2Score,
    p1Name: raw.p1Name,
    p2Name: raw.p2Name,
    winner: g.p1Score > g.p2Score ? 1 : 2,
    mode: "quick",
    createdAt: g.createdAt,
  }));
  const totalGames = games.length;
  const p1Wins = games.filter((g) => g.winner === 1).length;
  const p2Wins = totalGames - p1Wins;
  const p1Points = games.reduce((a, g) => a + g.p1Score, 0);
  const p2Points = games.reduce((a, g) => a + g.p2Score, 0);
  let p1Streak = 0, p2Streak = 0;
  if (games[0]) {
    const w = games[0].winner;
    let c = 0; for (const g of games) { if (g.winner === w) c++; else break; }
    if (w === 1) p1Streak = c; else p2Streak = c;
  }
  const biggestMargin = games.reduce((m, g) => Math.max(m, Math.abs(g.p1Score - g.p2Score)), 0);
  return {
    p1Name: raw.p1Name, p2Name: raw.p2Name, games,
    stats: {
      totalGames, p1Wins, p2Wins, p1Points, p2Points, p1Streak, p2Streak, biggestMargin,
      avgP1: totalGames ? Math.round((p1Points / totalGames) * 10) / 10 : 0,
      avgP2: totalGames ? Math.round((p2Points / totalGames) * 10) / 10 : 0,
      lastWinner: games[0]?.winner ?? null,
    },
  };
}

/** Standalone stand-in for the space SDK's safe-area scrim: paints the
 *  notch / status-bar strip with the app background colour. */
function SafeAreaTopScrim({ backgroundColor }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-40"
      style={{ height: "env(safe-area-inset-top, 0px)", background: backgroundColor }}
    />
  );
}

let audioCtx = null;
function beep(freq, dur = 0.09, type = "square", vol = 0.05) {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const o = audioCtx.createOscillator();
    const gn = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    gn.gain.setValueAtTime(vol, audioCtx.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(gn); gn.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch { /* silent */ }
}
const sfxWin = () => {
  [523, 659, 784, 1046].forEach((f, i) => window.setTimeout(() => beep(f, 0.16, "triangle", 0.08), i * 110));
  [392, 523, 659, 784, 1046, 1318].forEach((f, i) => window.setTimeout(() => beep(f, 0.22, "triangle", 0.09), 520 + i * 95));
};

/** Haptic tick — vibrates where the device supports it, silent no-op elsewhere. */
function haptic(pattern = 8) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}
const sfxTick = () => beep(1500, 0.018, "square", 0.012);

/**
 * Sleek horizontal drag wheel for picking a score, sitting below a big
 * readout of the current number. Drag left/right (or scroll, or use arrow
 * keys) — each detent steps the value by 1 with a haptic tick and a faint
 * click. Plain vertical tick lines scroll past the centre marker like a ruler drum — no numbers in the strip.
 */
const WHEEL_MIN = 0;
const WHEEL_MAX = 99;
const WHEEL_ITEM_W = 16;
const WHEEL_STEP_PX = WHEEL_ITEM_W;

function ScoreWheel({ label, value, set, color, aria }) {
  const [editingNum, setEditingNum] = useState(false);
  const [draft, setDraft] = useState("");
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const dragRef = useRef(null);
  const wheelAcc = useRef(0);

  const commit = (n) => {
    const clamped = Math.max(WHEEL_MIN, Math.min(WHEEL_MAX, n));
    if (clamped !== valueRef.current) {
      valueRef.current = clamped;
      set(clamped);
      haptic(8);
      sfxTick();
    }
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startValue: valueRef.current, moved: false };
    setDragging(true);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 3) d.moved = true;
    // Dragging the strip left pulls higher numbers under the centre marker.
    const steps = Math.round(-dx / WHEEL_STEP_PX);
    commit(d.startValue + steps);
    setOffset(dx + steps * WHEEL_STEP_PX);
  };
  const endDrag = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    setOffset(0);
    if (d && !d.moved) {
      // A tap on a number beside the selection steps toward it.
      const rect = e.currentTarget.getBoundingClientRect();
      const rel = e.clientX - (rect.left + rect.width / 2);
      if (rel < -12) commit(valueRef.current - 1);
      else if (rel > 12) commit(valueRef.current + 1);
    }
  };
  const onWheel = (e) => {
    wheelAcc.current += e.deltaY;
    const steps = Math.trunc(wheelAcc.current / 48);
    if (steps !== 0) {
      wheelAcc.current -= steps * 48;
      commit(valueRef.current - steps);
    }
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); commit(valueRef.current + 1); }
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); commit(valueRef.current - 1); }
    else if (e.key === "PageUp") { e.preventDefault(); commit(valueRef.current + 5); }
    else if (e.key === "PageDown") { e.preventDefault(); commit(valueRef.current - 5); }
    else if (e.key === "Home") { e.preventDefault(); commit(WHEEL_MIN); }
    else if (e.key === "End") { e.preventDefault(); commit(WHEEL_MAX); }
  };

  const fadeMask = "linear-gradient(to right, transparent, black 22%, black 78%, transparent)";

  return (
    <div className="flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface2)] p-3 text-center">
      <div className="text-xs font-bold tracking-widest" style={{ color }}>{label}</div>
      {editingNum ? (
        <input
          type="number" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done"
          aria-label={`Type ${aria} score`} autoFocus value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => { const n = parseInt(draft, 10); if (!Number.isNaN(n)) commit(n); setEditingNum(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } if (e.key === "Escape") setEditingNum(false); }}
          className="font-display mt-1 w-full bg-transparent text-center text-[64px] leading-none text-[var(--text)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      ) : (
        <button type="button" aria-label={`Type ${aria} score`} title="Tap to type"
          onClick={() => { setDraft(String(value)); setEditingNum(true); }}
          className="block w-full cursor-text">
          <span key={value} aria-hidden="true" className="score-pop font-display mt-1 block text-[64px] leading-none">{value}</span>
          <span aria-hidden="true" className="mt-0.5 block text-[9px] font-bold tracking-[0.25em] text-[var(--dim)]">TAP TO TYPE</span>
        </button>
      )}
      <div className="mt-2 flex justify-center gap-2">
        <button type="button" aria-label={`Decrease ${aria} score`} disabled={value <= WHEEL_MIN}
          onClick={() => commit(valueRef.current - 1)}
          className="flex h-10 w-14 items-center justify-center rounded-xl bg-black/40 text-2xl font-black text-white/90 disabled:opacity-30 active:scale-95">−</button>
        <button type="button" aria-label={`Increase ${aria} score`} disabled={value >= WHEEL_MAX}
          onClick={() => commit(valueRef.current + 1)}
          className="flex h-10 w-14 items-center justify-center rounded-xl bg-black/40 text-2xl font-black text-white/90 disabled:opacity-30 active:scale-95">+</button>
      </div>
      <div
        role="spinbutton"
        tabIndex={0}
        aria-label={`${aria} score`}
        aria-valuemin={WHEEL_MIN}
        aria-valuemax={WHEEL_MAX}
        aria-valuenow={value}
        className="relative mx-auto mt-2 h-[52px] w-full cursor-grab touch-none select-none overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:cursor-grabbing"
        style={{ maskImage: fadeMask, WebkitMaskImage: fadeMask }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: 41 }, (_, i) => i - 20).map((k) => {
          const n = value + k;
          if (n < WHEEL_MIN || n > WHEEL_MAX) return null;
          const x = k * WHEEL_ITEM_W + offset;
          const dist = x / WHEEL_ITEM_W;
          const ad = Math.abs(dist);
          return (
            <div
              key={k}
              aria-hidden="true"
              className="absolute top-0 flex h-[52px] items-center justify-center"
              style={{
                width: WHEEL_ITEM_W,
                left: `calc(50% + ${x}px)`,
                transform: "translateX(-50%)",
                opacity: Math.max(0.15, 1 - ad * 0.07),
                transition: dragging ? "none" : "left 160ms ease-out, opacity 160ms ease-out",
              }}
            >
              <span
                className="block rounded-full"
                style={{
                  width: 2,
                  height: 24,
                  background: "var(--dim)",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Stacked vertical bars: player 1 (bottom) vs player 2 (top) per bucket. */
function StackedBars({ data, ariaLabel }) {
  const max = Math.max(1, ...data.map((d) => d.p1 + d.p2));
  return (
    <div role="img" aria-label={ariaLabel}>
      <div className="flex h-[120px] items-end gap-1.5">
        {data.map((d, i) => {
          const total = d.p1 + d.p2;
          return (
            <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[11px] font-black text-[var(--text)]">{total || ""}</span>
              <div className="chart-bar flex w-full max-w-[38px] flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${Math.max(total ? 7 : 0, (total / max) * 78)}%`, animationDelay: `${i * 45}ms` }}>
                <div style={{ height: total ? `${(d.p1 / total) * 100}%` : "0%", background: "var(--p1)" }} />
                <div style={{ height: total ? `${(d.p2 / total) * 100}%` : "0%", background: "var(--p2)" }} />
              </div>
              <span className="text-center text-[10px] font-black tracking-wide text-[var(--text)]">{d.label}</span>
              {d.sub && <span className="text-center text-[9px] font-bold leading-none text-[var(--dim)]">{d.sub}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartCard({ title, note, children }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg tracking-wide">{title}</h3>
        {note && <span className="text-right text-[10px] font-bold tracking-wider text-[var(--dim)]">{note}</span>}
      </div>
      {children}
    </div>
  );
}

/** The Breakdown: histograms + race graph computed from every recorded game. */
function DeepStats({ games, p1Name, p2Name }) {
  const d = useMemo(() => {
    const chrono = [...games].reverse();
    const bucket = (labels, key) =>
      labels.map((lb, i) => ({ ...lb, p1: chrono.filter((g) => key(g) === i && g.winner === 1).length, p2: chrono.filter((g) => key(g) === i && g.winner === 2).length, total: chrono.filter((g) => key(g) === i).length }));
    const marginLabels = ["1", "2", "3", "4", "5", "6", "7", "8", "9+"].map((label) => ({ label }));
    const margins = bucket(marginLabels, (g) => Math.min(8, Math.abs(g.p1Score - g.p2Score) - 1));
    const dowLabels = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((label) => ({ label }));
    const dow = bucket(dowLabels, (g) => (new Date(g.createdAt).getDay() + 6) % 7);
    // New visualizations: all-time points, per-game point differential, scoring distribution, recent form
    const tp1 = chrono.reduce((a, g) => a + g.p1Score, 0);
    const tp2 = chrono.reduce((a, g) => a + g.p2Score, 0);
    const diffs = chrono.map((g) => ({ diff: g.p1Score - g.p2Score, margin: Math.abs(g.p1Score - g.p2Score), winner: g.winner, s1: g.p1Score, s2: g.p2Score }));
    const maxAbsDiff = Math.max(1, ...diffs.map((x) => Math.abs(x.diff)));
    const scoreDist = ["0–5", "6–8", "9–10", "11+"].map((label, i) => {
      const inB = (s) => (i === 0 ? s <= 5 : i === 1 ? s >= 6 && s <= 8 : i === 2 ? s >= 9 && s <= 10 : s >= 11);
      return { label, p1: chrono.filter((g) => inB(g.p1Score)).length, p2: chrono.filter((g) => inB(g.p2Score)).length };
    });
    const form = diffs.slice(-14);
    // Extra records
    const bestStreak = (p) => { let best = 0, cur = 0; for (const g of chrono) { cur = g.winner === p ? cur + 1 : 0; best = Math.max(best, cur); } return best; };
    const marginsArr = chrono.map((g) => Math.abs(g.p1Score - g.p2Score));
    const close = chrono.filter((g) => Math.abs(g.p1Score - g.p2Score) <= 3).length;
    const blowouts = chrono.filter((g) => Math.abs(g.p1Score - g.p2Score) >= 7).length;
    const shutouts = chrono.filter((g) => Math.min(g.p1Score, g.p2Score) === 0).length;
    const deuce = chrono.filter((g) => Math.max(g.p1Score, g.p2Score) > 11).length;
    const avgMargin = chrono.length ? Math.round((marginsArr.reduce((a, b) => a + b, 0) / chrono.length) * 10) / 10 : 0;
    const longest = chrono.reduce((a, g) => (!a || g.p1Score + g.p2Score > a.p1Score + a.p2Score ? g : a), null);
    // Cumulative wins race points
    let c1 = 0, c2 = 0;
    const pts1 = [[0, 0]], pts2 = [[0, 0]];
    chrono.forEach((g, i) => { if (g.winner === 1) c1++; else c2++; pts1.push([i + 1, c1]); pts2.push([i + 1, c2]); });
    return { margins, dow, tp1, tp2, pointsPct1: tp1 + tp2 ? Math.round((tp1 / (tp1 + tp2)) * 100) : 50, diffs, maxAbsDiff, scoreDist, form, best1: bestStreak(1), best2: bestStreak(2), closePct: chrono.length ? Math.round((close / chrono.length) * 100) : 0, blowouts, shutouts, deuce, avgMargin, longest, pts1, pts2, maxWins: Math.max(c1, c2, 1), n: chrono.length };
  }, [games]);

  const toPath = (pts) => pts.map(([x, y]) => `${(24 + (x / Math.max(1, d.n)) * 552).toFixed(1)},${(176 - (y / d.maxWins) * 148).toFixed(1)}`).join(" ");
  const swingPoints = d.diffs.map((x, i) => `${(d.n > 1 ? 24 + (i / (d.n - 1)) * 552 : 300).toFixed(1)},${(100 - (x.diff / d.maxAbsDiff) * 76).toFixed(1)}`).join(" ");
  const donutC = 2 * Math.PI * 52;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { v: `x${Math.max(d.best1, d.best2)}`, l: `BEST STREAK — ${d.best1 >= d.best2 ? p1Name.toUpperCase() : p2Name.toUpperCase()}` },
          { v: `${d.closePct}%`, l: "CLOSE GAMES (≤3)" },
          { v: String(d.blowouts), l: "BLOWOUTS (7+)" },
          { v: String(d.avgMargin), l: "AVG MARGIN" },
          { v: String(d.deuce), l: "DEUCE GAMES" },
          { v: d.longest ? `${d.longest.p1Score + d.longest.p2Score}` : "—", l: "LONGEST GAME (PTS)" },
        ].map((s) => (
          <div key={s.l} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2 py-4">
            <div className="font-display text-3xl">{s.v}</div>
            <div className="mt-1 text-[10px] font-bold tracking-[0.18em] text-[var(--dim)]">{s.l}</div>
          </div>
        ))}
      </div>
      <ChartCard title="WIN MARGIN" note="WINS BY HOW FAR APART THEY FINISHED">
        <StackedBars data={d.margins} ariaLabel={`Histogram of winning margins: ${d.margins.map((b) => `margin ${b.label}: ${b.p1 + b.p2} games`).join(", ")}`} />
      </ChartCard>
      <ChartCard title="DAY OF WEEK WINS">
        <StackedBars data={d.dow} ariaLabel={`Wins by day of week: ${d.dow.map((b) => `${b.label} ${b.p1 + b.p2} wins`).join(", ")}`} />
      </ChartCard>
      <ChartCard title="THE RACE" note="CUMULATIVE WINS OVER TIME">
        <svg viewBox="0 0 600 200" className="w-full" role="img" aria-label={`Cumulative wins race: ${p1Name} ${d.pts1[d.pts1.length - 1]?.[1] ?? 0} wins, ${p2Name} ${d.pts2[d.pts2.length - 1]?.[1] ?? 0} wins over ${d.n} games`}>
          {[0.25, 0.5, 0.75, 1].map((f) => (<line key={f} x1="24" x2="576" y1={176 - f * 148} y2={176 - f * 148} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 5" />))}
          <polyline points={toPath(d.pts2)} fill="none" stroke="var(--p2)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={toPath(d.pts1)} fill="none" stroke="var(--p1)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="mt-1 flex justify-between text-[10px] font-black tracking-widest">
          <span style={{ color: "var(--p1)" }}>{p1Name.toUpperCase()} — {d.pts1[d.pts1.length - 1]?.[1] ?? 0}</span>
          <span className="text-[var(--dim)]">GAME 1 → GAME {d.n}</span>
          <span style={{ color: "var(--p2)" }}>{d.pts2[d.pts2.length - 1]?.[1] ?? 0} — {p2Name.toUpperCase()}</span>
        </div>
      </ChartCard>
      <ChartCard title="POINTS DOMINANCE" note="SHARE OF EVERY POINT EVER SCORED">
        <div className="flex items-center gap-5">
          <svg viewBox="0 0 140 140" className="h-[128px] w-[128px] shrink-0" role="img" aria-label={`Points dominance: ${p1Name} scored ${d.tp1} points (${d.pointsPct1} percent), ${p2Name} scored ${d.tp2} points (${100 - d.pointsPct1} percent)`}>
            <circle cx="70" cy="70" r="52" fill="none" stroke="var(--p2)" strokeWidth="17" />
            <circle cx="70" cy="70" r="52" fill="none" stroke="var(--p1)" strokeWidth="17" strokeLinecap="butt"
              strokeDasharray={`${(d.pointsPct1 / 100) * donutC} ${donutC}`} transform="rotate(-90 70 70)" />
            <text x="70" y="66" textAnchor="middle" fill="var(--text)" fontSize="26" fontWeight="900" fontFamily="var(--font-display)">{d.pointsPct1}%</text>
            <text x="70" y="86" textAnchor="middle" fill="var(--dim)" fontSize="9" fontWeight="800" letterSpacing="1.5">{(d.tp1 >= d.tp2 ? p1Name : p2Name).toUpperCase()} POINTS</text>
          </svg>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <div className="flex items-baseline justify-between gap-2"><span className="truncate text-xs font-black tracking-widest" style={{ color: "var(--p1)" }}>{p1Name.toUpperCase()}</span><span className="font-display text-3xl">{d.tp1}</span></div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-black/50"><div className="h-full" style={{ width: `${d.pointsPct1}%`, background: "var(--p1)" }} /></div>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-2"><span className="truncate text-xs font-black tracking-widest" style={{ color: "var(--p2)" }}>{p2Name.toUpperCase()}</span><span className="font-display text-3xl">{d.tp2}</span></div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-black/50"><div className="h-full" style={{ width: `${100 - d.pointsPct1}%`, background: "var(--p2)" }} /></div>
            </div>
            <p className="text-[11px] font-bold leading-snug text-[var(--dim)]">{Math.abs(d.tp1 - d.tp2)} points separate them across {d.n} game{d.n === 1 ? "" : "s"} — every rally ever played, counted.</p>
          </div>
        </div>
      </ChartCard>
      <ChartCard title="THE SWING" note="POINT DIFFERENTIAL, GAME BY GAME">
        <svg viewBox="0 0 600 200" className="w-full" role="img" aria-label={`Point differential per game: ${d.diffs.map((x, i) => `game ${i + 1}: ${x.diff > 0 ? "+" : ""}${x.diff}`).join(", ")}`}>
          <line x1="24" x2="576" y1="100" y2="100" stroke="var(--dim)" strokeWidth="1.5" strokeDasharray="5 5" />
          <polyline points={swingPoints} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {d.diffs.map((x, i) => (
            <circle key={i} cx={d.n > 1 ? 24 + (i / (d.n - 1)) * 552 : 300} cy={100 - (x.diff / d.maxAbsDiff) * 76} r="6" fill={x.winner === 1 ? "var(--p1)" : "var(--p2)"} stroke="var(--bg)" strokeWidth="2" />
          ))}
        </svg>
        <div className="mt-1 flex justify-between text-[10px] font-black tracking-widest">
          <span style={{ color: "var(--p1)" }}>ABOVE = {p1Name.toUpperCase()} WON</span>
          <span style={{ color: "var(--p2)" }}>{p2Name.toUpperCase()} WON = BELOW</span>
        </div>
      </ChartCard>
      <ChartCard title="THE MOMENTUM" note={`LAST ${d.form.length} GAME${d.form.length === 1 ? "" : "S"} — TALLER BAR, BIGGER WIN`}>
        <div role="img" aria-label={`Recent form, oldest to newest: ${d.form.map((x) => `${x.winner === 1 ? p1Name : p2Name} won ${x.s1} to ${x.s2}`).join(", ")}`}>
          <div className="flex h-[110px] items-end gap-1.5">
            {d.form.map((x, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] font-black text-[var(--text)]">{x.margin}</span>
                <div className="chart-bar w-full max-w-[38px] rounded-t-md" style={{ height: `${Math.max(9, (x.margin / Math.max(1, d.maxAbsDiff)) * 76)}%`, background: x.winner === 1 ? "var(--p1)" : "var(--p2)", animationDelay: `${i * 45}ms` }} />
                <span className="text-center text-[10px] font-black tracking-wide text-[var(--dim)]">{x.s1}–{x.s2}</span>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>
      <ChartCard title="SCORING DISTRIBUTION" note="HOW MANY POINTS EACH PLAYER SCORES PER GAME">
        <StackedBars data={d.scoreDist} ariaLabel={`Scoring distribution: ${d.scoreDist.map((b) => `${b.label} points: ${p1Name} in ${b.p1} games, ${p2Name} in ${b.p2} games`).join(", ")}`} />
      </ChartCard>
      <p className="flex gap-4 text-[10px] font-black tracking-widest text-[var(--dim)]">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "var(--p1)" }} />{p1Name.toUpperCase()} WINS</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "var(--p2)" }} />{p2Name.toUpperCase()} WINS</span>
        {d.shutouts > 0 && <span>{d.shutouts} SHUTOUT{d.shutouts === 1 ? "" : "S"} ON RECORD</span>}
      </p>
    </div>
  );
}

export default function App() {
  const [raw, setRaw] = useState(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [confettiIntensity, setConfettiIntensity] = useState(1);
  const [celebration, setCelebration] = useState(null);

  // Quick log
  const [q1, setQ1] = useState(11);
  const [q2, setQ2] = useState(7);
  const [quickMsg, setQuickMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // Names
  const [editingNames, setEditingNames] = useState(false);
  const [n1, setN1] = useState("");
  const [n2, setN2] = useState("");

  const data = useMemo(() => (raw ? computeState(raw) : undefined), [raw]);
  const dataRef = useRef(data);
  dataRef.current = data;
  const editingNamesRef = useRef(editingNames);
  editingNamesRef.current = editingNames;
  const celebrationRef = useRef(celebration);
  celebrationRef.current = celebration;

  const load = useCallback(async () => {
    const fresh = await apiFetch("/api/state");
    setRaw(fresh);
    setLoadFailed(false);
    return fresh;
  }, []);

  useEffect(() => {
    load().catch(() => setLoadFailed(true));
    const t = setInterval(() => {
      if (document.hidden || editingNamesRef.current || celebrationRef.current) return;
      load().catch(() => {});
    }, 12000);
    return () => clearInterval(t);
  }, [load]);

  const isPending = raw === undefined && !loadFailed;
  const hasError = loadFailed && raw === undefined;

  const p1Name = data?.p1Name ?? "Gabriel";
  const p2Name = data?.p2Name ?? "Sai";

  const fireCelebration = (gamesBefore, winner, s1, s2) => {
    const wName = winner === 1 ? p1Name : p2Name;
    const lName = winner === 1 ? p2Name : p1Name;
    const ctx = buildCtx(gamesBefore ?? [], winner, s1, s2);
    const variant = pickVariant(ctx, wName, lName);
    setConfettiIntensity(2);
    setConfettiKey((k) => k + 1);
    setCelebration({ winner, s1, s2, variant });
    sfxWin();
    haptic([25, 50, 25, 50, 70]);
  };

  const saveQuick = async () => {
    if (q1 === q2) { setQuickMsg("Tied? Impossible. Pickleball demands a winner — win by 2."); return; }
    setQuickMsg("");
    const winner = q1 > q2 ? 1 : 2;
    const gamesBefore = dataRef.current?.games ?? [];
    setSaving(true);
    try {
      await apiFetch("/api/games", { method: "POST", body: JSON.stringify({ p1Score: q1, p2Score: q2 }) });
    } catch {
      setSaving(false);
      setQuickMsg("Couldn't save that game. Check your connection and try again.");
      return;
    }
    setSaving(false);
    fireCelebration(gamesBefore, winner, q1, q2);
    load().catch(() => {});
  };

  const deleteGameById = async (id) => {
    try {
      await apiFetch(`/api/games/${encodeURIComponent(id)}`, { method: "DELETE" });
      load().catch(() => {});
    } catch { /* the next poll will reconcile */ }
  };

  const savePlayers = async () => {
    try {
      await apiFetch("/api/state", { method: "PATCH", body: JSON.stringify({ p1Name: n1.trim(), p2Name: n2.trim() }) });
      setEditingNames(false);
      load().catch(() => {});
    } catch { /* keep the form open so the edit is not lost */ }
  };

  const stats = data?.stats;
  const winPct1 = stats && stats.totalGames ? Math.round((stats.p1Wins / stats.totalGames) * 100) : 50;
  const streakName = (stats?.p1Streak ?? 0) >= 2 ? p1Name : (stats?.p2Streak ?? 0) >= 2 ? p2Name : null;
  const streakCount = Math.max(stats?.p1Streak ?? 0, stats?.p2Streak ?? 0);
  const ticker = useMemo(() => {
    const bits = [
      `${p1Name.toUpperCase()} VS ${p2Name.toUpperCase()}`,
      stats ? `${stats.totalGames} GAMES ON RECORD` : "FIRST GAME PENDING",
      stats?.p1Streak ? `${p1Name.toUpperCase()} ON A ${stats.p1Streak}-GAME TEAR` : null,
      stats?.p2Streak ? `${p2Name.toUpperCase()} ON A ${stats.p2Streak}-GAME TEAR` : null,
      "WIN BY 2", "FIRST TO 11", "NO MERCY RULE",
    ].filter(Boolean);
    return bits.join("  •  ") + "  •  ";
  }, [p1Name, p2Name, stats]);

  const celebWinnerName = celebration ? (celebration.winner === 1 ? p1Name : p2Name) : "";
  const celebWScore = celebration ? Math.max(celebration.s1, celebration.s2) : 0;
  const celebLScore = celebration ? Math.min(celebration.s1, celebration.s2) : 0;
  const celebVariant = celebration?.variant ?? null;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <Confetti fireKey={confettiKey} intensity={confettiIntensity} />

      {/* WINNER TAKEOVER — variant celebration: animation + trash talk depend on how the win happened */}
      {celebration && celebVariant && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/90" role="dialog" aria-modal="true" aria-label={`${celebWinnerName} wins ${celebWScore} to ${celebLScore}. ${celebVariant.name}`}>
          <div className={`${celebVariant.strobe ? "celeb-strobe-hard" : "celebration-flash"} pointer-events-none absolute inset-0`} style={{ background: celebration.winner === 1 ? "var(--p1)" : "var(--p2)" }} aria-hidden="true" />
          <div className="absolute inset-0" aria-hidden="true">
            <div className={`victory-rays ${celebVariant.raysClass} absolute inset-0`} style={{ background: `repeating-conic-gradient(from 0deg at 50% 50%, ${celebration.winner === 1 ? "var(--p1)" : "var(--p2)"} 0deg 6deg, transparent 6deg 17deg)` }} />
            <div className="absolute inset-0">
              <VictoryBurst winnerColor={celebration.winner === 1 ? "#39d0ff" : "#ff5a3c"} mode={celebVariant.burstMode} count={celebVariant.burstCount} speedMult={celebVariant.burstSpeed} ringCount={celebVariant.ringCount} />
            </div>
            {Array.from({ length: Math.min(3, celebVariant.ringCount) }, (_, i) => (
              <span key={i} className={`victory-ring ${i === 1 ? "victory-ring-2" : i === 2 ? "victory-ring-3" : ""}`} style={{ borderColor: i === 1 ? "var(--accent)" : celebration.winner === 1 ? "var(--p1)" : "var(--p2)" }} />
            ))}
          </div>
          <div className="relative flex h-full flex-col items-center justify-center px-5 text-center">
            <div className={`${celebVariant.textClass} font-display mt-2 text-[64px] leading-[0.95] text-white sm:text-[110px]`}
              style={{ textShadow: `0 0 44px ${celebration.winner === 1 ? "var(--p1)" : "var(--p2)"}` }}>
              {celebWinnerName.toUpperCase()}<br />WINS
            </div>
            <div className="score-slam font-display mt-3 text-6xl text-[var(--accent)] sm:text-7xl">{celebWScore}–{celebLScore}</div>
            <p className="commentary-in mt-3 inline-block rounded-full border border-[var(--accent)] px-3 py-1 text-[10px] font-black tracking-[0.3em] text-[var(--accent)]">{celebVariant.name}</p>
            <p className="commentary-in font-display mt-3 text-2xl tracking-wide text-white sm:text-3xl">{celebVariant.headline}</p>
            <p className="commentary-in mt-2 max-w-md text-sm font-semibold text-white/85 sm:text-base">{celebVariant.detail}</p>
            <button type="button" onClick={() => setCelebration(null)}
              className="commentary-in mt-7 w-full max-w-md rounded-2xl bg-[var(--accent)] py-4 text-lg font-black tracking-widest text-black active:scale-[0.98]">
              DONE
            </button>
          </div>
        </div>
      )}

      {/* Ticker */}
      <div className="overflow-hidden border-b border-[var(--border)] bg-black/50 py-1.5" aria-hidden="true">
        <div className="marquee-track flex w-max whitespace-nowrap text-[11px] font-bold tracking-[0.2em] text-[var(--accent)]">
          <span className="pr-4">{ticker.repeat(3)}</span><span className="pr-4">{ticker.repeat(3)}</span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl px-4 pb-16">
        {/* Names / rivalry header */}
        <div className="float-in pt-5">
          {editingNames ? (
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (n1.trim() && n2.trim()) savePlayers(); }}>
              <label className="flex-1 text-xs font-bold tracking-widest text-[var(--dim)]">PLAYER 1
                <input aria-label="Player 1 name" value={n1} onChange={(e) => setN1(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-base text-[var(--text)]" />
              </label>
              <label className="flex-1 text-xs font-bold tracking-widest text-[var(--dim)]">PLAYER 2
                <input aria-label="Player 2 name" value={n2} onChange={(e) => setN2(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-base text-[var(--text)]" />
              </label>
              <button type="submit" className="rounded-xl bg-[var(--accent)] px-4 py-2.5 font-black text-black active:scale-95">SAVE</button>
              <button type="button" onClick={() => setEditingNames(false)} className="rounded-xl bg-[var(--surface2)] px-4 py-2.5 font-bold">Cancel</button>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold tracking-[0.25em] text-[var(--dim)]">THE RIVALRY · EST. 2026</p>
              <button type="button" onClick={() => { setN1(p1Name); setN2(p2Name); setEditingNames(true); }}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold tracking-wider text-[var(--dim)] active:scale-95">
                RENAME PLAYERS
              </button>
            </div>
          )}
          {stats && stats.totalGames > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs font-black tracking-widest">
                <span style={{ color: "var(--p1)" }}>{p1Name.toUpperCase()} — {stats.p1Wins} WINS</span>
                <span style={{ color: "var(--p2)" }}>{stats.p2Wins} WINS — {p2Name.toUpperCase()}</span>
              </div>
              <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-black/50" role="img" aria-label={`Head to head: ${p1Name} ${stats.p1Wins} wins, ${p2Name} ${stats.p2Wins} wins`}>
                <div className="h-full transition-all duration-700" style={{ width: `${winPct1}%`, background: "var(--p1)" }} />
                <div className="h-full flex-1" style={{ background: "var(--p2)" }} />
              </div>
              {streakName && (
                <p className="mt-2 text-xs font-black tracking-widest text-[var(--accent)]">{streakName.toUpperCase()} STREAK x{streakCount}</p>
              )}
            </div>
          )}
        </div>

        {/* ADD A SCORE — the main event */}
        <section aria-label="Add a score" className="float-in mt-6" style={{ animationDelay: "60ms" }}>
          <div className="mb-2 flex items-end justify-between">
            <h2 className="font-display text-3xl tracking-wide">ADD A SCORE</h2>
          </div>
          <div className="flex gap-3">
            <ScoreWheel label={p1Name.toUpperCase()} value={q1} set={setQ1} color="var(--p1)" aria={p1Name} />
            <ScoreWheel label={p2Name.toUpperCase()} value={q2} set={setQ2} color="var(--p2)" aria={p2Name} />
          </div>
          {quickMsg && <p className="mt-2 text-center text-sm font-bold text-[var(--p2)]">{quickMsg}</p>}
          <button type="button" onClick={saveQuick} disabled={saving}
            className="mt-3 w-full rounded-2xl bg-[var(--accent)] py-5 text-xl font-black tracking-widest text-black disabled:opacity-50 active:scale-[0.98]">
            SAVE GAME {q1}–{q2}
          </button>
        </section>

        {/* STATS */}
        {stats && stats.totalGames > 0 && (
          <section aria-label="All time stats" className="float-in mt-10" style={{ animationDelay: "180ms" }}>
            <h2 className="font-display mb-2 text-2xl tracking-wide">THE RECORD BOOK</h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { v: String(stats.totalGames), l: "GAMES" },
                { v: `${stats.p1Points}–${stats.p2Points}`, l: "ALL-TIME POINTS" },
                { v: String(stats.biggestMargin), l: "BIGGEST BLOWOUT" },
                { v: `${stats.avgP1}`, l: `${p1Name.toUpperCase()} AVG` },
                { v: `${stats.avgP2}`, l: `${p2Name.toUpperCase()} AVG` },
                { v: stats.p1Streak || stats.p2Streak ? `x${Math.max(stats.p1Streak, stats.p2Streak)}` : "—", l: "CURRENT STREAK" },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2 py-4">
                  <div className="font-display text-3xl">{s.v}</div>
                  <div className="mt-1 text-[10px] font-bold tracking-[0.2em] text-[var(--dim)]">{s.l}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* THE BREAKDOWN — charts & graphs */}
        {data && data.games.length > 0 && (
          <section aria-label="Charts and deeper stats" className="float-in mt-10" style={{ animationDelay: "210ms" }}>
            <h2 className="font-display mb-2 text-2xl tracking-wide">THE BREAKDOWN</h2>
            <DeepStats games={data.games} p1Name={p1Name} p2Name={p2Name} />
          </section>
        )}

        {/* HISTORY */}
        <section aria-label="Game history" className="float-in mt-10" style={{ animationDelay: "240ms" }}>
          <h2 className="font-display mb-2 text-2xl tracking-wide">HISTORY</h2>
          {isPending && <p className="py-6 text-center font-bold text-[var(--dim)]">Loading the record book...</p>}
          {hasError && <p className="py-6 text-center font-bold text-[var(--p2)]">Couldn't load games. Pull to retry by reopening the page.</p>}
          {data && data.games.length === 0 && (
            <div className="rounded-3xl border-2 border-dashed border-[var(--border)] p-8 text-center">
              <p className="font-display text-2xl">NO GAMES YET</p>
              <p className="mt-1 text-sm font-semibold text-[var(--dim)]">The rivalry is unwritten. Add a score above and etch the first result here forever.</p>
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            {data?.games.map((g) => {
              const wName = g.winner === 1 ? g.p1Name : g.p2Name;
              const wColor = g.winner === 1 ? "var(--p1)" : "var(--p2)";
              return (
                <article key={g.id} className="float-in rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex items-center gap-3">
                    <div className="font-display text-4xl leading-none">
                      <span style={{ color: g.winner === 1 ? "var(--p1)" : undefined }}>{g.p1Score}</span>
                      <span className="mx-1 text-[var(--dim)]">–</span>
                      <span style={{ color: g.winner === 2 ? "var(--p2)" : undefined }}>{g.p2Score}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-black" style={{ color: wColor }}>{wName.toUpperCase()} WINS</div>
                      <div className="truncate text-xs font-semibold text-[var(--dim)]">
                        {new Date(g.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {new Date(g.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                    <button type="button" aria-label={`Delete game ${g.p1Score} to ${g.p2Score}`} onClick={() => deleteGameById(g.id)}
                      className="shrink-0 rounded-lg bg-black/40 px-2.5 py-2 text-xs font-bold text-white/70 active:scale-95">Delete</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
