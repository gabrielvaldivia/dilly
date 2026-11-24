import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FxText } from "./components/FxText.jsx";
import { Stage } from "./components/Stage.jsx";
import { apiFetch } from "./lib/api.js";
import { useParallax } from "./lib/parallax.js";
import { isMuted, setMuted as storeMuted, sfx } from "./lib/sfx.js";
import { buildIndex, gamesFor, headToHead, matchupGames, sidesOf, teamName } from "./lib/stats.js";
import { FighterSheet } from "./screens/FighterSheet.jsx";
import { KOScreen } from "./screens/KOScreen.jsx";
import { MatchScreen } from "./screens/MatchScreen.jsx";
import { RecordsScreen } from "./screens/RecordsScreen.jsx";
import { ALL_SLOTS, SLOTS, SelectScreen } from "./screens/SelectScreen.jsx";
import { VersusScreen } from "./screens/VersusScreen.jsx";
import { buildCtx, pickVariant } from "./variants.js";

/* ------------------------------------------------------------------ */
/* Flow: SELECT → VERSUS → MATCH → K.O. → (rematch | select | records) */
/* Data lives in the hosted API (/api/state, /api/players, /api/games). */
/* An in-progress match is mirrored to localStorage so a locked phone  */
/* or a refresh mid-game doesn't lose the score.                       */
/*                                                                     */
/* Singles or doubles: a match is two teams of fighter ids, one each   */
/* in singles, two each in doubles ({ team1, team2, s1, s2 }). The     */
/* first fighter of a doubles team is the one "on point" in the HUD;   */
/* tagging swaps the pair.                                             */
/* ------------------------------------------------------------------ */

const MATCH_KEY = "dilly:match";
const MODE_KEY = "dilly:mode";
const EMPTY_SEL = { p1: null, p1b: null, p2: null, p2b: null };

function readStoredMatch() {
  try {
    const m = JSON.parse(localStorage.getItem(MATCH_KEY));
    if (!m || !Number.isInteger(m.s1) || !Number.isInteger(m.s2)) return null;
    // Earlier builds stored a singles match as { aId, bId }.
    const team1 = Array.isArray(m.team1) ? m.team1 : [m.aId];
    const team2 = Array.isArray(m.team2) ? m.team2 : [m.bId];
    if ([...team1, ...team2].every((id) => typeof id === "string")) return { team1, team2, s1: m.s1, s2: m.s2 };
  } catch { /* none or unreadable */ }
  return null;
}

function writeStoredMatch(m) {
  try {
    if (m) localStorage.setItem(MATCH_KEY, JSON.stringify(m));
    else localStorage.removeItem(MATCH_KEY);
  } catch { /* storage blocked */ }
}

function readMode() {
  try { return localStorage.getItem(MODE_KEY) === "doubles" ? "doubles" : "singles"; } catch { return "singles"; }
}

function writeMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage blocked */ }
}

/** Two equal teams of one or two fighters who all exist, nobody twice. */
function validTeams(team1, team2, ids) {
  const all = [...team1, ...team2];
  return team1.length === team2.length && team1.length >= 1 && team1.length <= 2
    && all.every((id) => ids.has(id)) && new Set(all).size === all.length;
}

/** Put two teams into the selection slots, clearing those fighters from any other slot. */
function seat(sel, team1, team2) {
  const placed = new Set([...team1, ...team2]);
  const next = Object.fromEntries(ALL_SLOTS.map((k) => [k, placed.has(sel[k]) ? null : sel[k]]));
  next.p1 = team1[0];
  next.p2 = team2[0];
  if (team1.length === 2) { next.p1b = team1[1]; next.p2b = team2[1]; }
  return next;
}

/** The selected teams for a mode. */
function teamsFrom(sel, mode) {
  return mode === "doubles" ? { team1: [sel.p1, sel.p1b], team2: [sel.p2, sel.p2b] } : { team1: [sel.p1], team2: [sel.p2] };
}

/** The most recent matchup of a team size whose fighters all still exist, as teams. */
function lastTeams(index, size) {
  const games = gamesFor(index, size);
  const last = games[games.length - 1];
  if (!last) return null;
  const [team1, team2] = sidesOf(last);
  return validTeams(team1, team2, index.byId) ? { team1, team2 } : null;
}

const sameOrder = (x, y) => x.length === y.length && x.every((id, i) => id === y[i]);

function Boot({ failed, onRetry }) {
  return (
    <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <FxText className="text-[clamp(64px,22vw,120px)]">Dilly</FxText>
      <p className="font-hud mt-3 text-[18px] font-semibold text-[var(--dim)]">PICKLEBALL FIGHTERS</p>
      {failed ? (
        <>
          <p className="mt-8 font-semibold text-[var(--p2)]">Couldn't reach the arena. Check your connection.</p>
          <button type="button" onClick={onRetry} className="font-hud slant-btn mt-4 bg-white px-6 pb-1 pt-2.5 text-[22px] font-bold text-black active:scale-95">
            RETRY
          </button>
        </>
      ) : (
        <p className="font-hud blink mt-10 text-[22px] font-semibold text-[var(--accent)]">LOADING…</p>
      )}
    </div>
  );
}

export default function App() {
  useParallax();
  const [raw, setRaw] = useState(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [screen, setScreen] = useState("select");
  const [mode, setModeState] = useState(readMode);
  const [sel, setSel] = useState(EMPTY_SEL);
  const [match, setMatch] = useState(null);
  const [ko, setKo] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [muted, setMutedState] = useState(isMuted);

  const index = useMemo(() => buildIndex(raw), [raw]);
  const busyRef = useRef(false);
  busyRef.current = Boolean(sheet) || screen === "ko" || saving;

  const load = useCallback(async () => {
    const fresh = await apiFetch("/api/state");
    setRaw(fresh);
    setLoadFailed(false);
    return fresh;
  }, []);

  useEffect(() => {
    load().catch(() => setLoadFailed(true));
    const t = window.setInterval(() => {
      if (document.hidden || busyRef.current) return;
      load().catch(() => {});
    }, 30000);
    return () => window.clearInterval(t);
  }, [load]);

  const setMode = (next) => {
    setModeState(next);
    writeMode(next);
  };

  // First load: resume a match in progress, else preselect the last matchup.
  const initialized = useRef(false);
  useEffect(() => {
    if (!raw || initialized.current) return;
    initialized.current = true;
    const stored = readStoredMatch();
    if (stored && validTeams(stored.team1, stored.team2, index.byId)) {
      setMode(stored.team1.length === 2 ? "doubles" : "singles");
      setSel(seat(EMPTY_SEL, stored.team1, stored.team2));
      setMatch(stored);
      setScreen("match");
      return;
    }
    writeStoredMatch(null);
    let next = EMPTY_SEL;
    const singles = lastTeams(index, 1);
    if (singles) next = seat(next, singles.team1, singles.team2);
    else if (raw.players.length >= 2) next = seat(next, [raw.players[0].id], [raw.players[1].id]);
    const doubles = mode === "doubles" && lastTeams(index, 2);
    if (doubles) next = seat(next, doubles.team1, doubles.team2);
    setSel(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  // Drop selections that point at fighters who no longer exist.
  useEffect(() => {
    if (!raw) return;
    setSel((s) => {
      const next = Object.fromEntries(ALL_SLOTS.map((k) => [k, s[k] && index.byId.has(s[k]) ? s[k] : null]));
      return ALL_SLOTS.every((k) => next[k] === s[k]) ? s : next;
    });
  }, [raw, index]);

  const toggleMute = () => {
    const next = !muted;
    storeMuted(next);
    setMutedState(next);
    if (!next) sfx.select(1);
  };

  /** Switching to doubles with no partners picked brings back the last doubles teams. */
  const changeMode = (next) => {
    setMode(next);
    if (next !== "doubles" || sel.p1b || sel.p2b) return;
    const last = lastTeams(index, 2);
    if (last) setSel((s) => seat(s, last.team1, last.team2));
  };

  /* ----------------------------- match ----------------------------- */

  const startVersus = () => {
    setSaveError("");
    setScreen("versus");
  };

  const afterVersus = () => {
    const { team1, team2 } = teamsFrom(sel, mode);
    setMatch((m) => (m && sameOrder(m.team1, team1) && sameOrder(m.team2, team2) ? m : { team1, team2, s1: 0, s2: 0 }));
    setScreen("match");
  };

  const onMatchChange = useCallback((score) => {
    setMatch((m) => {
      if (!m) return m;
      const next = { ...m, ...score };
      writeStoredMatch(next);
      return next;
    });
  }, []);

  /** Doubles: the partner tags in and takes point. */
  const tagMatch = useCallback((side) => {
    setMatch((m) => {
      const key = side === 1 ? "team1" : "team2";
      if (!m || m[key].length < 2) return m;
      const next = { ...m, [key]: [...m[key]].reverse() };
      writeStoredMatch(next);
      return next;
    });
  }, []);

  const quitMatch = () => {
    writeStoredMatch(null);
    setMatch(null);
    setSaveError("");
    setScreen("select");
  };

  const saveMatch = async (s1, s2) => {
    const { team1, team2 } = match;
    const a = team1.map((id) => index.byId.get(id));
    const b = team2.map((id) => index.byId.get(id));
    if (![...a, ...b].every(Boolean)) return;
    const doubles = team1.length === 2;
    const before = matchupGames(gamesFor(index, team1.length), team1, team2);
    const body = doubles
      ? { p1Ids: team1, p2Ids: team2, p1Score: s1, p2Score: s2 }
      : { p1Id: team1[0], p2Id: team2[0], p1Score: s1, p2Score: s2 };
    setSaving(true);
    setSaveError("");
    try {
      await apiFetch("/api/games", { method: "POST", body: JSON.stringify(body) });
    } catch (err) {
      setSaving(false);
      setSaveError(err.message || "Couldn't save that game. Check your connection and try again.");
      sfx.deny();
      return;
    }
    setSaving(false);
    writeStoredMatch(null);
    const winner = s1 > s2 ? 1 : 2;
    const wName = teamName(winner === 1 ? a : b);
    const lName = teamName(winner === 1 ? b : a);
    const variant = pickVariant(buildCtx(before, winner, s1, s2), wName, lName);
    setKo({ team1, team2, s1, s2, winner, variant });
    setMatch(null);
    setScreen("ko");
    load().catch(() => {});
  };

  const rematch = () => {
    setSel((s) => seat(s, ko.team1, ko.team2));
    setMatch({ team1: ko.team1, team2: ko.team2, s1: 0, s2: 0 });
    setKo(null);
    setScreen("versus");
  };

  const deleteGame = async (id) => {
    setRaw((r) => (r ? { ...r, games: r.games.filter((g) => g.id !== id), doubles: (r.doubles ?? []).filter((g) => g.id !== id) } : r));
    try {
      await apiFetch(`/api/games/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* the reload below restores it if the delete didn't land */
    }
    load().catch(() => {});
  };

  /* ---------------------------- fighters --------------------------- */

  const openAdd = (slot) => setSheet({ mode: "add", slot: slot ?? null });
  const openEdit = (player) => setSheet({ mode: "edit", player });

  const onSheetSaved = (player) => {
    const opened = sheet;
    setSheet(null);
    setRaw((r) => {
      if (!r) return r;
      const exists = r.players.some((p) => p.id === player.id);
      return { ...r, players: exists ? r.players.map((p) => (p.id === player.id ? player : p)) : [...r.players, player] };
    });
    if (opened?.mode === "add") {
      setSel((cur) => {
        const slot = opened.slot ?? SLOTS[mode].find((k) => !cur[k]);
        return slot ? { ...cur, [slot]: player.id } : cur;
      });
    }
    load().catch(() => {});
  };

  const onSheetDeleted = (id) => {
    setSheet(null);
    setRaw((r) => (r ? {
      players: r.players.filter((p) => p.id !== id),
      games: r.games.filter((g) => g.p1Id !== id && g.p2Id !== id),
      doubles: (r.doubles ?? []).filter((g) => !g.p1Ids.includes(id) && !g.p2Ids.includes(id)),
    } : r));
    load().catch(() => {});
  };

  /* ----------------------------- render ---------------------------- */

  const fighters = (ids) => {
    const list = ids?.map((id) => index.byId.get(id));
    return list && list.every(Boolean) ? list : null;
  };
  const picked = teamsFrom(sel, mode);
  const selA = fighters(picked.team1);
  const selB = fighters(picked.team2);
  const matchA = fighters(match?.team1);
  const matchB = fighters(match?.team2);
  const koA = fighters(ko?.team1);
  const koB = fighters(ko?.team2);
  const sheetPlayer = sheet?.player ? index.byId.get(sheet.player.id) ?? sheet.player : null;
  const playedBy = (id) =>
    index.games.filter((g) => g.p1Id === id || g.p2Id === id).length
    + index.doubles.filter((g) => g.p1Ids.includes(id) || g.p2Ids.includes(id)).length;

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <Stage />
      {raw === undefined ? (
        <Boot failed={loadFailed} onRetry={() => { setLoadFailed(false); load().catch(() => setLoadFailed(true)); }} />
      ) : (
        <>
          {(screen === "select" || screen === "versus") && (
            <SelectScreen
              index={index}
              mode={mode}
              onMode={changeMode}
              sel={sel}
              setSel={setSel}
              onFight={startVersus}
              onAdd={openAdd}
              onEdit={openEdit}
              onRecords={() => setScreen("records")}
              muted={muted}
              onToggleMute={toggleMute}
            />
          )}
          {screen === "records" && (
            <RecordsScreen
              index={index}
              mode={mode}
              sel={sel}
              onBack={() => setScreen("select")}
              onEdit={openEdit}
              onAdd={() => openAdd(null)}
              onDeleteGame={deleteGame}
            />
          )}
          {screen === "versus" && selA && selB && (
            <VersusScreen a={selA} b={selB} onDone={afterVersus} />
          )}
          {screen === "match" && matchA && matchB && (
            <MatchScreen
              a={matchA}
              b={matchB}
              initial={match}
              round={headToHead(gamesFor(index, matchA.length), match.team1, match.team2).total + 1}
              onChange={onMatchChange}
              onTag={tagMatch}
              onSave={saveMatch}
              onQuit={quitMatch}
              saving={saving}
              error={saveError}
            />
          )}
          {screen === "ko" && ko && koA && koB && (
            <KOScreen
              winners={ko.winner === 1 ? koA : koB}
              losers={ko.winner === 1 ? koB : koA}
              side={ko.winner}
              s1={ko.s1}
              s2={ko.s2}
              variant={ko.variant}
              onRematch={rematch}
              onSelect={() => { setKo(null); setScreen("select"); }}
              onRecords={() => { setKo(null); setScreen("records"); }}
            />
          )}
        </>
      )}
      {sheet && (
        <FighterSheet
          key={sheet.player?.id ?? "new"}
          mode={sheet.mode}
          player={sheetPlayer}
          gameCount={sheetPlayer ? playedBy(sheetPlayer.id) : 0}
          onClose={() => setSheet(null)}
          onSaved={onSheetSaved}
          onDeleted={onSheetDeleted}
        />
      )}
    </div>
  );
}
