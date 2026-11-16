import { useEffect, useMemo, useState } from "react";
import { DeepStats } from "../components/DeepStats.jsx";
import { FxText } from "../components/FxText.jsx";
import { IconBack, IconChevronDown, IconPlus } from "../components/Icons.jsx";
import { Portrait } from "../components/Portrait.jsx";
import { headToHead, leaderboard, matchupGames, rivalries } from "../lib/stats.js";

const TABS = [
  { id: "rankings", label: "RANKINGS" },
  { id: "rivalries", label: "RIVALRIES" },
  { id: "history", label: "HISTORY" },
];

function Face({ player, className = "", tone }) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden border-2 border-black ${tone ? `tone-${tone} shadow-[0_0_0_2px_var(--tone)]` : ""} ${className}`}
      style={{ transform: "skewX(-6deg)" }}
    >
      <div className="absolute inset-y-0 -left-[14%] -right-[14%]" style={{ transform: "skewX(6deg)" }}>
        <Portrait player={player} initialSize="60cqw" />
      </div>
    </div>
  );
}

function when(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function Rankings({ index, onEdit, onAdd }) {
  const rows = useMemo(() => leaderboard(index.players, index.games), [index]);
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r, i) => {
        const rank = r.played ? i + 1 : null;
        return (
          <button
            key={r.player.id}
            type="button"
            onClick={() => onEdit(r.player)}
            className="float-in flex items-center gap-3 rounded-sm border border-white/10 bg-[var(--surface)] p-2.5 pr-3 text-left active:scale-[0.99]"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className={`font-display w-9 shrink-0 text-center text-[30px] leading-none ${rank === 1 ? "text-[var(--accent)]" : "text-white/70"}`}>
              {rank ?? "–"}
            </span>
            <Face player={r.player} className="h-[60px] w-[48px]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display truncate text-[22px] leading-tight tracking-wide">{r.player.name.toUpperCase()}</span>
                {r.streak >= 2 && <span className="font-hud shrink-0 bg-[var(--accent)] px-1.5 pt-1 text-[14px] font-bold text-black">W{r.streak} STREAK</span>}
                {r.streak <= -3 && <span className="font-hud shrink-0 bg-white/15 px-1.5 pt-1 text-[14px] font-semibold text-white/70">L{-r.streak}</span>}
              </div>
              {r.played ? (
                <>
                  <div className="font-hud mt-0.5 text-[16px] font-semibold text-white/70">
                    {r.wins}W · {r.losses}L · {r.winPct}% · {r.pointsFor}–{r.pointsAgainst} PTS
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden bg-black/60">
                    <div className="h-full bg-gradient-to-r from-[var(--hot)] to-[var(--accent)]" style={{ width: `${r.winPct}%` }} />
                  </div>
                </>
              ) : (
                <div className="font-hud mt-0.5 text-[16px] font-semibold text-white/45">NO GAMES YET</div>
              )}
            </div>
          </button>
        );
      })}
      <button type="button" onClick={onAdd} className="font-hud mt-1 flex items-center justify-center gap-2 rounded-sm border-2 border-dashed border-[var(--accent)]/70 py-3 pt-4 text-[20px] font-semibold text-[var(--accent)] active:scale-[0.99]">
        <IconPlus className="-mt-1 h-4 w-4" /> ADD A FIGHTER
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

  if (!list.length) {
    return <Empty title="NO RIVALRIES YET" />;
  }
  return (
    <div className="flex flex-col gap-3">
      {list.map((r) => {
        const key = `${r.aId}|${r.bId}`;
        // Show the currently selected P1 on the left when this is their matchup.
        const flip = sel.p1 === r.bId || (sel.p2 === r.aId && sel.p1 !== r.aId);
        const aId = flip ? r.bId : r.aId;
        const bId = flip ? r.aId : r.bId;
        const a = index.byId.get(aId);
        const b = index.byId.get(bId);
        const h = headToHead(index.games, aId, bId);
        const isOpen = open === key;
        const pct = h.total ? (h.aWins / h.total) * 100 : 50;
        return (
          <section key={key} className="rounded-sm border border-white/10 bg-[var(--surface)]">
            <button type="button" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen} className="block w-full p-3 text-left">
              <div className="flex items-center gap-3">
                <Face player={a} tone="p1" className="h-[58px] w-[46px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-end justify-between gap-2">
                    <span className="font-display truncate text-[18px] leading-none" style={{ color: "var(--p1)" }}>{a.name.toUpperCase()}</span>
                    <span className="font-display shrink-0 text-[30px] leading-none">
                      <span style={{ color: "var(--p1)" }}>{h.aWins}</span>
                      <span className="mx-1 text-white/35">–</span>
                      <span style={{ color: "var(--p2)" }}>{h.bWins}</span>
                    </span>
                    <span className="font-display truncate text-right text-[18px] leading-none" style={{ color: "var(--p2)" }}>{b.name.toUpperCase()}</span>
                  </div>
                  <div className="mt-2 flex h-2 overflow-hidden bg-black/60">
                    <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: "var(--p1)" }} />
                    <div className="h-full flex-1" style={{ background: "var(--p2)" }} />
                  </div>
                  <div className="font-hud mt-1.5 text-center text-[14px] font-semibold text-white/50">
                    {h.total} GAME{h.total === 1 ? "" : "S"} <span aria-hidden="true" className="ml-1 inline-block align-[-1px] transition-transform" style={{ transform: isOpen ? "rotate(180deg)" : "none" }}><IconChevronDown className="h-3 w-3" /></span>
                  </div>
                </div>
                <Face player={b} tone="p2" className="h-[58px] w-[46px]" />
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-white/10 p-3">
                <DeepStats games={matchupGames(index.games, aId, bId)} p1Name={a.name} p2Name={b.name} />
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
  if (!games.length) return <Empty title="NO GAMES YET" />;
  const unknown = (id) => ({ id, name: "???", photo: null });
  return (
    <div className="flex flex-col gap-2">
      {games.map((g, i) => {
        const a = index.byId.get(g.p1Id) ?? unknown(g.p1Id);
        const b = index.byId.get(g.p2Id) ?? unknown(g.p2Id);
        const aWon = g.p1Score > g.p2Score;
        return (
          <article key={g.id} className="float-in rounded-sm border border-white/10 bg-[var(--surface)] p-2.5" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
            <div className="flex items-center gap-2.5">
              <Face player={a} className={`h-11 w-9 ${aWon ? "" : "opacity-50 grayscale"}`} />
              <div className="min-w-0 flex-1">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <span className={`font-display truncate text-[16px] leading-none ${aWon ? "text-[var(--accent)]" : "text-white/55"}`}>{a.name.toUpperCase()}</span>
                  <span className="font-display shrink-0 text-[28px] leading-none">
                    <span className={aWon ? "text-white" : "text-white/45"}>{g.p1Score}</span>
                    <span className="mx-1 text-white/30">–</span>
                    <span className={!aWon ? "text-white" : "text-white/45"}>{g.p2Score}</span>
                  </span>
                  <span className={`font-display truncate text-right text-[16px] leading-none ${!aWon ? "text-[var(--accent)]" : "text-white/55"}`}>{b.name.toUpperCase()}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-white/45">{when(g.createdAt)}</span>
                  <button
                    type="button"
                    onClick={() => (confirmId === g.id ? (setConfirmId(null), onDeleteGame(g.id)) : setConfirmId(g.id))}
                    aria-label={`Delete ${a.name} ${g.p1Score} to ${g.p2Score} ${b.name}`}
                    className={`font-hud rounded-sm px-2 pt-1 text-[14px] font-semibold active:scale-95 ${confirmId === g.id ? "bg-[var(--p2)] text-white" : "bg-black/40 text-white/55"}`}
                  >
                    {confirmId === g.id ? "CONFIRM" : "DELETE"}
                  </button>
                </div>
              </div>
              <Face player={b} className={`h-11 w-9 ${!aWon ? "" : "opacity-50 grayscale"}`} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Empty({ title }) {
  return (
    <div className="rounded-sm border-2 border-dashed border-white/15 p-8 text-center">
      <p className="font-display text-[26px]">{title}</p>
    </div>
  );
}

export function RecordsScreen({ index, sel, onBack, onEdit, onAdd, onDeleteGame }) {
  const [tab, setTab] = useState("rankings");
  return (
    <div className="no-select relative z-10 mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+10px)]">
      <header className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="font-hud slant-btn flex items-center gap-1.5 bg-white/12 px-4 pb-1 pt-2.5 text-[19px] font-semibold active:scale-95">
          <IconBack className="-mt-1 h-4 w-4" /> SELECT
        </button>
        <span className="font-hud text-[16px] font-semibold text-white/55">
          {index.games.length} GAME{index.games.length === 1 ? "" : "S"} · {index.players.length} FIGHTERS
        </span>
      </header>
      <div className="mt-4">
        <FxText tone="chrome" className="text-[clamp(36px,11vw,52px)]">Records</FxText>
      </div>
      <nav className="mt-4 grid grid-cols-3 gap-2" aria-label="Records sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`font-hud slant-btn pb-1 pt-2.5 text-[19px] font-semibold active:scale-95 ${tab === t.id ? "bg-[var(--accent)] text-black" : "bg-white/10 text-white/75"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="mt-4">
        {tab === "rankings" && <Rankings index={index} onEdit={onEdit} onAdd={onAdd} />}
        {tab === "rivalries" && <Rivalries index={index} sel={sel} />}
        {tab === "history" && <History index={index} onDeleteGame={onDeleteGame} />}
      </div>
    </div>
  );
}
