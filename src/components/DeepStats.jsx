import { useMemo } from "react";

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
export function DeepStats({ games, p1Name, p2Name }) {
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
