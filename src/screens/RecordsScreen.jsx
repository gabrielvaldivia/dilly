import { useEffect, useMemo, useState } from "react";
import { FxText } from "../components/FxText.jsx";
import { IconBack, IconChevronDown, IconPlus } from "../components/Icons.jsx";
import { ModeSwitch } from "../components/ModeSwitch.jsx";
import { Portrait } from "../components/Portrait.jsx";
import { RivalryStats } from "../components/RivalryStats.jsx";
import { useBook } from "../lib/spine.js";
import { headToHead, leaderboard, matchupGames, rivalries, sameTeam, sidesOf, teamLeaderboard, teamName } from "../lib/stats.js";

/* ------------------------------------------------------------------ */
/* Records. Three text styles only — t-big (numbers), t-name (names),  */
/* t-hud (everything else) — on slanted cards, skewed plates and       */
/* health-bar meters, matching the rest of the arcade UI.              */
/* Singles and doubles keep separate books; the switch in the header   */
/* flips every tab between them.                                       */
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

/** One face, or a doubles pair overlapped corner to corner in the same box. */
function TeamFaces({ team, className = "", tone, dim }) {
  if (team.length < 2) return <Face player={team[0]} tone={tone} dim={dim} className={className} />;
  return (
    <div className={`relative shrink-0 ${className}`}>
      <div className="absolute bottom-0 right-0 h-[72%] w-[62%]"><Face player={team[1]} tone={tone} dim={dim} className="h-full w-full" /></div>
      <div className="absolute left-0 top-0 h-[72%] w-[62%]"><Face player={team[0]} tone={tone} dim={dim} className="h-full w-full" /></div>
    </div>
  );
}

/** A side's name: one line, or one line per partner. */
function TeamLabel({ team, className = "", right = false }) {
  if (team.length < 2) return <span className={`t-name truncate ${className}`}>{team[0].name}</span>;
  return (
    <span className={`flex min-w-0 flex-col gap-1 ${right ? "items-end" : "items-start"} ${className}`}>
      {team.map((p) => <span key={p.id} className="t-name max-w-full truncate text-[16px]!">{p.name}</span>)}
    </span>
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

/** A list split over the two pages of the book layout. */
function Pages({ left, right, gap = "gap-2" }) {
  return (
    <div className="pages">
      <div className={`page-l flex flex-col ${gap}`}>{left}</div>
      <div className={`page-r flex flex-col ${gap}`}>{right}</div>
    </div>
  );
}

function Rankings({ index, onEdit, onAdd }) {
  const rows = useMemo(() => leaderboard(index.players, index.games), [index]);
  const book = useBook();
  const cards = rows.map((r, i) => {
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
  });
  const add = (
    <button key="add" type="button" onClick={onAdd} className="rec-card mt-1 flex items-center justify-center gap-2 py-4 text-[var(--accent)] active:scale-[0.99]">
      <IconPlus className="h-4 w-4" />
      <span className="t-hud pt-0.5">Add a fighter</span>
    </button>
  );
  if (book) {
    // Down the left page, then on down the right.
    const half = Math.ceil((cards.length + 1) / 2);
    return <Pages left={cards.slice(0, half)} right={[...cards.slice(half), add]} />;
  }
  return (
    <div className="flex flex-col gap-2">
      {cards}
      {add}
    </div>
  );
}

function Heading({ children }) {
  return <h2 className="t-hud mb-2 mt-1 text-white/55">{children}</h2>;
}

/** Doubles standings: partnerships first, then every fighter's doubles record (side by side as two pages). */
function DoublesRankings({ index, onEdit }) {
  const teams = useMemo(() => teamLeaderboard(index.players, index.doubles), [index]);
  const fighters = useMemo(() => leaderboard(index.players, index.doubles).filter((r) => r.played), [index]);
  const book = useBook();
  if (!teams.length) return <Empty title="No doubles games yet" />;
  const teamCards = [
    <Heading key="h">Teams</Heading>,
    ...teams.map((r, i) => (
      <article
        key={r.key}
        className={`rec-card float-in flex items-center gap-3 px-4 py-2.5 ${i === 0 ? "rec-card-gold" : ""}`}
        style={{ animationDelay: `${i * 40}ms` }}
      >
        <span className={`rec-plate h-10 w-10 shrink-0 ${i === 0 ? "bg-[var(--accent)] text-black" : "bg-black/45 text-white"}`}>
          <span className="t-big">{i + 1}</span>
        </span>
        <TeamFaces team={r.team} className="h-14 w-14" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="t-name truncate">{teamName(r.team)}</span>
            {r.streak >= 2 && <span className="rec-plate shrink-0 bg-[var(--accent)] px-2 pb-0.5 pt-1 text-black"><span className="t-hud">W{r.streak}</span></span>}
          </div>
          <div className="t-hud mt-1.5 text-white/55">{`${r.wins}W · ${r.losses}L · ${r.winPct}%`}</div>
          <div className="rec-bar mt-2">
            <span style={{ width: `${r.winPct}%`, background: "linear-gradient(90deg, var(--hot), var(--accent))" }} />
          </div>
        </div>
      </article>
    )),
  ];
  const fighterCards = [
    <div key="h" className={book ? "" : "mt-4"}><Heading>Fighters</Heading></div>,
    ...fighters.map((r, i) => (
      <button
        key={r.player.id}
        type="button"
        onClick={() => onEdit(r.player)}
        className="rec-card float-in flex items-center gap-3 px-4 py-2.5 text-left active:scale-[0.99]"
        style={{ animationDelay: `${((book ? 0 : teams.length) + i) * 40}ms` }}
      >
        <span className="rec-plate h-10 w-10 shrink-0 bg-black/45 text-white"><span className="t-big">{i + 1}</span></span>
        <Face player={r.player} className="h-14 w-11" />
        <div className="min-w-0 flex-1">
          <span className="t-name block truncate">{r.player.name}</span>
          <div className="t-hud mt-1.5 text-white/55">{`${r.wins}W · ${r.losses}L · ${r.winPct}%`}</div>
        </div>
      </button>
    )),
  ];
  if (book) return <Pages left={teamCards} right={fighterCards} />;
  return (
    <div className="flex flex-col gap-2">
      {teamCards}
      {fighterCards}
    </div>
  );
}

/**
 * Every rivalry; tap one for its breakdown. On one page the breakdown opens
 * under the card; in the book layout the list is the left page and the
 * breakdown of the open rivalry is the right.
 */
function Rivalries({ index, games, sel, doubles }) {
  const list = useMemo(() => rivalries(index.players, games), [index, games]);
  const book = useBook();
  // The selected sides, as teams: who sits on the left, and which rivalry opens first.
  const [mine1, mine2] = doubles ? [[sel.p1, sel.p1b], [sel.p2, sel.p2b]] : [[sel.p1], [sel.p2]];
  const defaultKey = useMemo(() => {
    const hit = list.find((r) => (sameTeam(r.a, mine1) && sameTeam(r.b, mine2)) || (sameTeam(r.a, mine2) && sameTeam(r.b, mine1)));
    return (hit ?? list[0])?.key ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, sel, doubles]);
  const [open, setOpen] = useState(defaultKey);
  useEffect(() => { setOpen((o) => o ?? defaultKey); }, [defaultKey]);

  if (!list.length) return <Empty title="No rivalries yet" />;
  let openStats = null;
  const cards = list.map((r) => {
    const key = r.key;
    // The selected 1P side sits on the left when this is their matchup.
    const flip = sameTeam(r.b, mine1) || (sameTeam(r.a, mine2) && !sameTeam(r.a, mine1));
    const aIds = flip ? r.b : r.a;
    const bIds = flip ? r.a : r.b;
    const a = aIds.map((id) => index.byId.get(id));
    const b = bIds.map((id) => index.byId.get(id));
    const h = headToHead(games, aIds, bIds);
    const isOpen = open === key;
    const pct = h.total ? (h.aWins / h.total) * 100 : 50;
    const stats = isOpen && <RivalryStats games={matchupGames(games, aIds, bIds)} aName={teamName(a)} bName={teamName(b)} />;
    if (isOpen) openStats = stats;
    return (
      <section key={key}>
        <button
          type="button"
          // The book layout always shows one breakdown, so tapping only switches.
          onClick={() => setOpen(isOpen && !book ? null : key)}
          aria-expanded={isOpen}
          className={`rec-card block w-full px-4 py-3 text-left active:scale-[0.99] ${book && isOpen ? "rec-card-gold" : ""}`}
        >
          <div className="flex items-center gap-3">
            <TeamFaces team={a} tone="p1" className={doubles ? "h-14 w-14" : "h-14 w-11"} />
            <div className="min-w-0 flex-1">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <TeamLabel team={a} />
                <span className="t-big">{h.aWins}–{h.bWins}</span>
                <TeamLabel team={b} right className="text-right" />
              </div>
              <div className="rec-bar mt-2.5">
                <span style={{ width: `${pct}%`, background: "var(--p1-chart)" }} />
                <span className="flex-1" style={{ background: "var(--p2-chart)" }} />
              </div>
              <div className="t-hud mt-2 flex items-center justify-center gap-1.5 text-white/55">
                {h.total} game{h.total === 1 ? "" : "s"}
                {!book && <IconChevronDown className={`-mt-0.5 h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />}
              </div>
            </div>
            <TeamFaces team={b} tone="p2" className={doubles ? "h-14 w-14" : "h-14 w-11"} />
          </div>
        </button>
        {!book && stats && <div className="px-1 pb-2 pt-5">{stats}</div>}
      </section>
    );
  });
  if (book) return <Pages left={cards} right={<div className="rec-stats">{openStats}</div>} gap="gap-3" />;
  return <div className="flex flex-col gap-3">{cards}</div>;
}

function History({ index, games: list, doubles, onDeleteGame }) {
  const [confirmId, setConfirmId] = useState(null);
  const book = useBook();
  useEffect(() => {
    if (!confirmId) return;
    const t = window.setTimeout(() => setConfirmId(null), 3000);
    return () => window.clearTimeout(t);
  }, [confirmId]);
  const games = useMemo(() => [...list].reverse(), [list]);
  if (!games.length) return <Empty title={doubles ? "No doubles games yet" : "No games yet"} />;
  const unknown = (id) => ({ id, name: "???", photo: null });
  const fighters = (ids) => ids.map((id) => index.byId.get(id) ?? unknown(id));
  const cards = games.map((g, i) => {
    const [x, y] = sidesOf(g);
    const a = fighters(x);
    const b = fighters(y);
    const aWon = g.p1Score > g.p2Score;
    const confirming = confirmId === g.id;
    return (
      <article key={g.id} className="rec-card float-in px-4 py-2.5" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
        <div className="flex items-center gap-3">
          <TeamFaces team={a} dim={!aWon} className={doubles ? "h-12 w-12" : "h-11 w-9"} />
          <div className="min-w-0 flex-1">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <TeamLabel team={a} className={aWon ? "" : "text-white/45"} />
              <span className="t-big">{g.p1Score}–{g.p2Score}</span>
              <TeamLabel team={b} right className={`text-right ${aWon ? "text-white/45" : ""}`} />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="t-hud text-white/55">{when(g.createdAt)}</span>
              <button
                type="button"
                onClick={() => (confirming ? (setConfirmId(null), onDeleteGame(g.id)) : setConfirmId(g.id))}
                aria-label={`Delete ${teamName(a)} ${g.p1Score} to ${g.p2Score} ${teamName(b)}`}
                className={`rec-plate px-2 pb-0.5 pt-1 active:scale-95 ${confirming ? "bg-[var(--p2)] text-white" : "bg-black/45 text-white/55"}`}
              >
                <span className="t-hud">{confirming ? "Confirm" : "Delete"}</span>
              </button>
            </div>
          </div>
          <TeamFaces team={b} dim={aWon} className={doubles ? "h-12 w-12" : "h-11 w-9"} />
        </div>
      </article>
    );
  });
  if (book) {
    // Newest first, down the left page and on down the right.
    const half = Math.ceil(cards.length / 2);
    return <Pages left={cards.slice(0, half)} right={cards.slice(half)} />;
  }
  return <div className="flex flex-col gap-2">{cards}</div>;
}

export function RecordsScreen({ index, mode, sel, onBack, onEdit, onAdd, onDeleteGame }) {
  const [tab, setTab] = useState("rankings");
  const [kind, setKind] = useState(mode ?? "singles");
  const doubles = kind === "doubles";
  const games = doubles ? index.doubles : index.games;
  return (
    <div className="rec-root book-pages pad-x no-select relative z-10 mx-auto flex min-h-dvh w-full max-w-[600px] flex-col pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+12px)]">
      <header className="rec-head grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Back to fighter select" className="rec-tab flex items-center gap-1.5 justify-self-start bg-white/12 px-4 pb-1.5 pt-2 active:scale-95">
          <IconBack className="h-4 w-4" />
          <span className="t-hud pt-0.5">Select</span>
        </button>
        <FxText tone="chrome" className="text-[clamp(30px,9vw,44px)]">Records</FxText>
        <ModeSwitch mode={kind} onChange={setKind} className="mode-switch-sm justify-self-end" />
      </header>

      <nav className="rec-tabs mt-5 grid grid-cols-3 gap-1.5" aria-label="Records sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`rec-tab py-2.5 active:scale-[0.98] ${tab === t.id ? "bg-[var(--accent)] text-black" : "bg-white/10 text-white/70"}`}
          >
            <span className="t-hud pt-0.5">{t.id === "history" && games.length ? `${t.label} · ${games.length}` : t.label}</span>
          </button>
        ))}
      </nav>

      <div key={kind} className="rec-body mt-5">
        {tab === "rankings" && (doubles ? <DoublesRankings index={index} onEdit={onEdit} /> : <Rankings index={index} onEdit={onEdit} onAdd={onAdd} />)}
        {tab === "rivalries" && <Rivalries index={index} games={games} sel={sel} doubles={doubles} />}
        {tab === "history" && <History index={index} games={games} doubles={doubles} onDeleteGame={onDeleteGame} />}
      </div>
    </div>
  );
}
