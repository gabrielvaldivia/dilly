import { useEffect, useMemo, useState } from "react";
import { FxText } from "../components/FxText.jsx";
import { IconBack, IconChevronDown, IconPlus } from "../components/Icons.jsx";
import { Portrait } from "../components/Portrait.jsx";
import { RivalryStats } from "../components/RivalryStats.jsx";
import { headToHead, leaderboard, matchupGames, rivalries } from "../lib/stats.js";

/* ------------------------------------------------------------------ */
/* Records. Three text styles only — t-big (numbers), t-name (names),  */
/* t-hud (everything else) — on slanted cards, skewed plates and       */
/* health-bar meters, matching the rest of the arcade UI.              */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: "rankings", label: "Rankings" },
  { id: "rivalries", label: "Rivalries" },
  { id: "history", label: "History" },
];

function Face({ player, className = "", tone, dim }) {
  return (
    <div className={`rec-face ${tone ? `tone-${tone}` : ""} ${dim ? "opacity-45 grayscale" : ""} ${className}`} style={tone ? { boxShadow: "0 0 0 2px #000, 0 0 0 4px var(--tone)" } : undefined}>
      <div><Portrait player={player} /></div>
    </div>
  );
}

function when(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function Empty({ title }) {
  return (
    <div className="rec-card px-6 py-10 text-center">
      <p className="t-name text-white/55">{title}</p>
    </div>
  );
}

function Rankings({ index, onEdit, onAdd }) {
  const rows = useMemo(() => leaderboard(index.players, index.games), [index]);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => {
        const rank = r.played ? i + 1 : null;
        return (
          <button
            key={r.player.id}
            type="button"
            onClick={() => onEdit(r.player)}
            className={`rec-card float-in flex items-center gap-3 px-4 py-2.5 text-left active:scale-[0.99] ${rank === 1 ? "rec-card-gold" : ""}`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className={`rec-plate h-10 w-10 shrink-0 ${rank === 1 ? "bg-[var(--accent)] text-black" : "bg-black/45 text-white"}`}>
              <span className="t-big">{rank ?? "–"}</span>
            </span>
            <Face player={r.player} className="h-14 w-11" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="t-name truncate">{r.player.name}</span>
                {r.streak >= 2 && <span className="rec-plate shrink-0 bg-[var(--accent)] px-2 pb-0.5 pt-1 text-black"><span className="t-hud">W{r.streak}</span></span>}
              </div>
              <div className="t-hud mt-1.5 text-white/55">
                {r.played ? `${r.wins}W · ${r.losses}L · ${r.winPct}%` : "No games yet"}
              </div>
              {r.played > 0 && (
                <div className="rec-bar mt-2">
                  <span style={{ width: `${r.winPct}%`, background: "linear-gradient(90deg, var(--hot), var(--accent))" }} />
                </div>
              )}
            </div>
          </button>
        );
      })}
      <button type="button" onClick={onAdd} className="rec-card mt-1 flex items-center justify-center gap-2 py-4 text-[var(--accent)] active:scale-[0.99]">
        <IconPlus className="h-4 w-4" />
        <span className="t-hud pt-0.5">Add a fighter</span>
      </button>
    </div>
  );
}

function Rivalries({ index, sel }) {
  const list = useMemo(() => rivalries(index.players, index.games), [index]);
  const defaultKey = useMemo(() => {
    const pairKey = sel.p1 && sel.p2 ? [sel.p1, sel.p2].sort().join("|") : null;
    if (pairKey && list.some((r) => `${r.aId}|${r.bId}` === pairKey)) return pairKey;
    return list[0] ? `${list[0].aId}|${list[0].bId}` : null;
  }, [list, sel]);
  const [open, setOpen] = useState(defaultKey);
  useEffect(() => { setOpen((o) => o ?? defaultKey); }, [defaultKey]);

  if (!list.length) return <Empty title="No rivalries yet" />;
  return (
    <div className="flex flex-col gap-3">
      {list.map((r) => {
        const key = `${r.aId}|${r.bId}`;
        // The selected P1 sits on the left when this is their matchup.
        const flip = sel.p1 === r.bId || (sel.p2 === r.aId && sel.p1 !== r.aId);
        const aId = flip ? r.bId : r.aId;
        const bId = flip ? r.aId : r.bId;
        const a = index.byId.get(aId);
        const b = index.byId.get(bId);
        const h = headToHead(index.games, aId, bId);
        const isOpen = open === key;
        const pct = h.total ? (h.aWins / h.total) * 100 : 50;
        return (
          <section key={key}>
            <button type="button" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen} className="rec-card block w-full px-4 py-3 text-left active:scale-[0.99]">
              <div className="flex items-center gap-3">
                <Face player={a} tone="p1" className="h-14 w-11" />
                <div className="min-w-0 flex-1">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <span className="t-name truncate">{a.name}</span>
                    <span className="t-big">{h.aWins}–{h.bWins}</span>
                    <span className="t-name truncate text-right">{b.name}</span>
                  </div>
                  <div className="rec-bar mt-2.5">
                    <span style={{ width: `${pct}%`, background: "var(--p1-chart)" }} />
                    <span className="flex-1" style={{ background: "var(--p2-chart)" }} />
                  </div>
                  <div className="t-hud mt-2 flex items-center justify-center gap-1.5 text-white/55">
                    {h.total} game{h.total === 1 ? "" : "s"}
                    <IconChevronDown className={`-mt-0.5 h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </div>
                <Face player={b} tone="p2" className="h-14 w-11" />
              </div>
            </button>
            {isOpen && (
              <div className="px-1 pb-2 pt-5">
                <RivalryStats games={matchupGames(index.games, aId, bId)} aName={a.name} bName={b.name} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function History({ index, onDeleteGame }) {
  const [confirmId, setConfirmId] = useState(null);
  useEffect(() => {
    if (!confirmId) return;
    const t = window.setTimeout(() => setConfirmId(null), 3000);
    return () => window.clearTimeout(t);
  }, [confirmId]);
  const games = useMemo(() => [...index.games].reverse(), [index]);
  if (!games.length) return <Empty title="No games yet" />;
  const unknown = (id) => ({ id, name: "???", photo: null });
  return (
    <div className="flex flex-col gap-2">
      {games.map((g, i) => {
        const a = index.byId.get(g.p1Id) ?? unknown(g.p1Id);
        const b = index.byId.get(g.p2Id) ?? unknown(g.p2Id);
        const aWon = g.p1Score > g.p2Score;
        const confirming = confirmId === g.id;
        return (
          <article key={g.id} className="rec-card float-in px-4 py-2.5" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
            <div className="flex items-center gap-3">
              <Face player={a} dim={!aWon} className="h-11 w-9" />
              <div className="min-w-0 flex-1">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <span className={`t-name truncate ${aWon ? "" : "text-white/45"}`}>{a.name}</span>
                  <span className="t-big">{g.p1Score}–{g.p2Score}</span>
                  <span className={`t-name truncate text-right ${aWon ? "text-white/45" : ""}`}>{b.name}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="t-hud text-white/55">{when(g.createdAt)}</span>
                  <button
                    type="button"
                    onClick={() => (confirming ? (setConfirmId(null), onDeleteGame(g.id)) : setConfirmId(g.id))}
                    aria-label={`Delete ${a.name} ${g.p1Score} to ${g.p2Score} ${b.name}`}
                    className={`rec-plate px-2 pb-0.5 pt-1 active:scale-95 ${confirming ? "bg-[var(--p2)] text-white" : "bg-black/45 text-white/55"}`}
                  >
                    <span className="t-hud">{confirming ? "Confirm" : "Delete"}</span>
                  </button>
                </div>
              </div>
              <Face player={b} dim={aWon} className="h-11 w-9" />
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function RecordsScreen({ index, sel, onBack, onEdit, onAdd, onDeleteGame }) {
  const [tab, setTab] = useState("rankings");
  return (
    <div className="no-select relative z-10 mx-auto flex min-h-dvh w-full max-w-[600px] flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+12px)]">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Back to fighter select" className="rec-tab flex items-center gap-1.5 justify-self-start bg-white/12 px-4 pb-1.5 pt-2 active:scale-95">
          <IconBack className="h-4 w-4" />
          <span className="t-hud pt-0.5">Select</span>
        </button>
        <FxText tone="chrome" className="text-[clamp(30px,9vw,44px)]">Records</FxText>
        <span className="t-hud justify-self-end text-right text-white/55">
          {index.games.length} game{index.games.length === 1 ? "" : "s"}
        </span>
      </header>

      <nav className="mt-5 grid grid-cols-3 gap-1.5" aria-label="Records sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`rec-tab py-2.5 active:scale-[0.98] ${tab === t.id ? "bg-[var(--accent)] text-black" : "bg-white/10 text-white/70"}`}
          >
            <span className="t-hud pt-0.5">{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {tab === "rankings" && <Rankings index={index} onEdit={onEdit} onAdd={onAdd} />}
        {tab === "rivalries" && <Rivalries index={index} sel={sel} />}
        {tab === "history" && <History index={index} onDeleteGame={onDeleteGame} />}
      </div>
    </div>
  );
}
