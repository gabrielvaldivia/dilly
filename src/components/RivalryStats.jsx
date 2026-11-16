import { useMemo, useState } from "react";

/* ------------------------------------------------------------------ */
/* Head-to-head breakdown for one rivalry: four stat tiles, the race   */
/* (cumulative wins), recent winning margins, and the share of points. */
/* Text uses the shared Records styles (t-big / t-hud); only marks     */
/* carry the player colors (--p1-chart / --p2-chart, validated pair).  */
/* games: newest first, oriented so "1" is player A.                   */
/* ------------------------------------------------------------------ */

const P1 = "var(--p1-chart)";
const P2 = "var(--p2-chart)";
const FORM_GAMES = 12;

function useBreakdown(games) {
  return useMemo(() => {
    const chrono = [...games].reverse();
    const n = chrono.length;
    const best = (side) => {
      let top = 0, run = 0;
      for (const g of chrono) { run = g.winner === side ? run + 1 : 0; top = Math.max(top, run); }
      return top;
    };
    const margins = chrono.map((g) => Math.abs(g.p1Score - g.p2Score));
    let w1 = 0, w2 = 0;
    const race = [{ a: 0, b: 0 }, ...chrono.map((g) => (g.winner === 1 ? w1++ : w2++, { a: w1, b: w2 }))];
    const pts1 = chrono.reduce((s, g) => s + g.p1Score, 0);
    const pts2 = chrono.reduce((s, g) => s + g.p2Score, 0);
    return {
      n,
      best1: best(1),
      best2: best(2),
      avgMargin: n ? Math.round((margins.reduce((a, b) => a + b, 0) / n) * 10) / 10 : 0,
      closePct: n ? Math.round((margins.filter((m) => m <= 3).length / n) * 100) : 0,
      longest: chrono.reduce((m, g) => Math.max(m, g.p1Score + g.p2Score), 0),
      race,
      maxWins: Math.max(1, w1, w2),
      form: chrono.slice(-FORM_GAMES).map((g, i, arr) => ({ ...g, number: n - arr.length + i + 1, margin: Math.abs(g.p1Score - g.p2Score) })),
      pts1,
      pts2,
    };
  }, [games]);
}

function Tile({ value, label }) {
  return (
    <div className="rec-card px-4 py-3">
      <div className="t-big">{value}</div>
      <div className="t-hud mt-1.5 text-white/55">{label}</div>
    </div>
  );
}

function Swatch({ color }) {
  return <span className="rec-plate h-2.5 w-4" style={{ background: color }} aria-hidden="true" />;
}

/**
 * Small card beside a chart point: to its right on the left half of the
 * chart, to its left on the right half, top-aligned, so it never leaves the
 * section card (whose clip-path would cut it off). Touch keeps it open after
 * the finger lifts; a mouse closes it on leave.
 */
function Popover({ left, top = 0, side, gap = 10, maxWidth, children }) {
  const tx = side === "right" ? `${gap}px` : `calc(-100% - ${gap}px)`;
  return (
    <div
      className="rec-tab pointer-events-none absolute z-10 whitespace-nowrap px-3 pb-2 pt-2.5"
      style={{ left, top, maxWidth, transform: `translateX(${tx})`, background: "rgba(10, 6, 24, .96)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18)" }}
    >
      {children}
    </div>
  );
}

/** A long name gives way before the number does. */
function PopRow({ color, name, value }) {
  return (
    <div className="t-hud mt-2 flex items-center gap-2">
      <Swatch color={color} />
      <span className="min-w-0 truncate">{name}</span>
      <span className="shrink-0">{value}</span>
    </div>
  );
}

const Card = ({ title, children }) => (
  <section className="rec-card px-4 pb-4 pt-3.5">
    <h3 className="t-hud">{title}</h3>
    {children}
  </section>
);
const closeOnMouseLeave = (setHover) => (e) => { if (e.pointerType === "mouse") setHover(null); };

/** Cumulative wins over time; hover or tap a point for the score at that game. */
function Race({ d, aName, bName }) {
  const [hover, setHover] = useState(null);
  const W = 600, H = 200, L = 8, R = 8, T = 14, B = 18;
  const x = (i) => L + (i / Math.max(1, d.n)) * (W - L - R);
  const y = (v) => H - B - (v / d.maxWins) * (H - T - B);
  const path = (k) => d.race.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const last = d.race[d.race.length - 1];
  const shown = hover ?? d.n;
  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - box.left) / box.width) * W;
    setHover(Math.max(0, Math.min(d.n, Math.round(((rel - L) / (W - L - R)) * d.n))));
  };
  const at = hover != null ? d.race[hover] : null;
  return (
    <Card title="The race">
      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-pan-y"
          role="img"
          aria-label={`Cumulative wins over ${d.n} games: ${aName} ${last.a}, ${bName} ${last.b}.`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={closeOnMouseLeave(setHover)}
        >
          {[0.5, 1].map((f) => (
            <line key={f} x1={L} x2={W - R} y1={y(d.maxWins * f)} y2={y(d.maxWins * f)} stroke="rgba(255,255,255,.1)" strokeDasharray="4 6" />
          ))}
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.22)" />
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={y(0)} stroke="rgba(255,255,255,.35)" />}
          <polyline points={path("b")} fill="none" stroke={P2} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <polyline points={path("a")} fill="none" stroke={P1} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {[["b", P2], ["a", P1]].map(([k, c]) => (
            <circle key={k} cx={x(shown)} cy={y(d.race[shown][k])} r="5.5" fill={c} stroke="#120a24" strokeWidth="2" />
          ))}
        </svg>
        {at && (() => {
          const fx = x(hover) / W;
          const side = fx < 0.5 ? "right" : "left";
          return (
            <Popover left={`${fx * 100}%`} top={`${(T / H) * 100}%`} side={side} maxWidth={`calc(${(side === "right" ? 1 - fx : fx) * 100}% - 10px)`}>
              <div className="t-hud text-white/55">{hover === 0 ? "Start" : `Game ${hover}`}</div>
              <PopRow color={P1} name={aName} value={at.a} />
              <PopRow color={P2} name={bName} value={at.b} />
            </Popover>
          );
        })()}
      </div>
    </Card>
  );
}

/** The last dozen games: bar height = margin, color = winner; hover or tap for the score. */
function Momentum({ d, aName, bName }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...d.form.map((g) => g.margin));
  return (
    <Card title="Winning margin">
      <div
        className="mt-3 grid h-24 items-end gap-1 pl-1 pr-6"
        style={{ gridTemplateColumns: `repeat(${FORM_GAMES}, minmax(0, 1fr))`, containerType: "inline-size" }}
        role="img"
        aria-label={`Last ${d.form.length} games, oldest to newest: ${d.form.map((f) => `${f.winner === 1 ? aName : bName} by ${f.margin}`).join(", ")}.`}
        onPointerLeave={closeOnMouseLeave(setHover)}
      >
        {d.form.map((f, i) => {
          const col = FORM_GAMES - d.form.length + i;
          const h = Math.max(10, (f.margin / max) * 100);
          const right = col < FORM_GAMES / 2;
          return (
            <button
              key={f.id}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="relative flex h-full items-end"
              style={{ gridColumnStart: col + 1 }}
              onPointerEnter={() => setHover(i)}
              onPointerDown={() => setHover(i)}
            >
              <span
                className="block w-full transition-opacity"
                style={{
                  height: `${h}%`,
                  background: f.winner === 1 ? P1 : P2,
                  // Lean from the base: bottoms stay in their slot and neighbours stay parallel.
                  transform: "skewX(-12deg)",
                  transformOrigin: "bottom",
                  opacity: hover == null || hover === i ? 1 : 0.45,
                }}
              />
              {hover === i && (
                // Bars lean right at the top, so a popover on the right needs extra clearance.
                <Popover
                  left={right ? "100%" : "0%"}
                  side={right ? "right" : "left"}
                  gap={right ? 26 : 8}
                  maxWidth={right ? `calc(${((FORM_GAMES - col - 1) / FORM_GAMES) * 100}cqw - 26px)` : `calc(${(col / FORM_GAMES) * 100}cqw - 8px)`}
                >
                  <div className="t-hud text-left text-white/55">Game {f.number}</div>
                  <PopRow
                    color={f.winner === 1 ? P1 : P2}
                    name={f.winner === 1 ? aName : bName}
                    value={`${Math.max(f.p1Score, f.p2Score)}–${Math.min(f.p1Score, f.p2Score)}`}
                  />
                </Popover>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Points({ d, aName, bName }) {
  const total = d.pts1 + d.pts2 || 1;
  const pct1 = Math.round((d.pts1 / total) * 100);
  return (
    <Card title="Points">
      <div className="rec-bar mt-3 h-3" role="img" aria-label={`${aName} scored ${d.pts1} points (${pct1}%), ${bName} scored ${d.pts2}.`}>
        <span style={{ width: `${pct1}%`, background: P1 }} />
        <span className="flex-1" style={{ background: P2 }} />
      </div>
      <div className="t-hud mt-2.5 flex justify-between text-white/55">
        <span>{aName} {d.pts1} · {pct1}%</span>
        <span>{100 - pct1}% · {d.pts2} {bName}</span>
      </div>
    </Card>
  );
}

export function RivalryStats({ games, aName, bName }) {
  const d = useBreakdown(games);
  const bestName = d.best1 >= d.best2 ? aName : bName;
  return (
    <div className="flex flex-col gap-4">
      <div className="t-hud flex items-center gap-4 text-white/55" aria-hidden="true">
        <span className="flex items-center gap-2"><Swatch color={P1} />{aName}</span>
        <span className="flex items-center gap-2"><Swatch color={P2} />{bName}</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Tile value={`x${Math.max(d.best1, d.best2)}`} label={`Best streak · ${bestName}`} />
          <Tile value={d.avgMargin} label="Avg margin" />
          <Tile value={`${d.closePct}%`} label="Close games" />
          <Tile value={d.longest} label="Longest game · pts" />
        </div>
        <Race d={d} aName={aName} bName={bName} />
        <Momentum d={d} aName={aName} bName={bName} />
        <Points d={d} aName={aName} bName={bName} />
      </div>
    </div>
  );
}
