import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FxText } from "./components/FxText.jsx";
import { Stage } from "./components/Stage.jsx";
import { apiFetch } from "./lib/api.js";
import { useParallax } from "./lib/parallax.js";
import { isMuted, setMuted as storeMuted, sfx } from "./lib/sfx.js";
import { buildIndex, headToHead, matchupGames } from "./lib/stats.js";
import { FighterSheet } from "./screens/FighterSheet.jsx";
import { KOScreen } from "./screens/KOScreen.jsx";
import { MatchScreen } from "./screens/MatchScreen.jsx";
import { RecordsScreen } from "./screens/RecordsScreen.jsx";
import { SelectScreen } from "./screens/SelectScreen.jsx";
import { VersusScreen } from "./screens/VersusScreen.jsx";
import { buildCtx, pickVariant } from "./variants.js";

/* ------------------------------------------------------------------ */
/* Flow: SELECT → VERSUS → MATCH → K.O. → (rematch | select | records) */
/* Data lives in the hosted API (/api/state, /api/players, /api/games). */
/* An in-progress match is mirrored to localStorage so a locked phone  */
/* or a refresh mid-game doesn't lose the score.                       */
/* ------------------------------------------------------------------ */

const MATCH_KEY = "dilly:match";

function readStoredMatch() {
  try {
    const m = JSON.parse(localStorage.getItem(MATCH_KEY));
    if (m && typeof m.aId === "string" && typeof m.bId === "string" && Number.isInteger(m.s1) && Number.isInteger(m.s2)) return m;
  } catch { /* none or unreadable */ }
  return null;
}

function writeStoredMatch(m) {
  try {
    if (m) localStorage.setItem(MATCH_KEY, JSON.stringify(m));
    else localStorage.removeItem(MATCH_KEY);
  } catch { /* storage blocked */ }
}

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
  const [sel, setSel] = useState({ p1: null, p2: null });
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
    }, 12000);
    return () => window.clearInterval(t);
  }, [load]);

  // First load: resume a match in progress, else preselect the last matchup.
  const initialized = useRef(false);
  useEffect(() => {
    if (!raw || initialized.current) return;
    initialized.current = true;
    const ids = new Set(raw.players.map((p) => p.id));
    const stored = readStoredMatch();
    if (stored && stored.aId !== stored.bId && ids.has(stored.aId) && ids.has(stored.bId)) {
      setSel({ p1: stored.aId, p2: stored.bId });
      setMatch(stored);
      setScreen("match");
      return;
    }
    writeStoredMatch(null);
    const last = raw.games[raw.games.length - 1];
    if (last && ids.has(last.p1Id) && ids.has(last.p2Id)) setSel({ p1: last.p1Id, p2: last.p2Id });
    else if (raw.players.length >= 2) setSel({ p1: raw.players[0].id, p2: raw.players[1].id });
  }, [raw]);

  // Drop selections that point at fighters who no longer exist.
  useEffect(() => {
    if (!raw) return;
    setSel((s) => {
      const p1 = s.p1 && index.byId.has(s.p1) ? s.p1 : null;
      const p2 = s.p2 && index.byId.has(s.p2) ? s.p2 : null;
      return p1 === s.p1 && p2 === s.p2 ? s : { p1, p2 };
    });
  }, [raw, index]);

  const toggleMute = () => {
    const next = !muted;
    storeMuted(next);
    setMutedState(next);
    if (!next) sfx.select(1);
  };

  /* ----------------------------- match ----------------------------- */

  const startVersus = () => {
    setSaveError("");
    setScreen("versus");
  };

  const afterVersus = () => {
    setMatch((m) => (m && m.aId === sel.p1 && m.bId === sel.p2 ? m : { aId: sel.p1, bId: sel.p2, s1: 0, s2: 0 }));
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

  const quitMatch = () => {
    writeStoredMatch(null);
    setMatch(null);
    setSaveError("");
    setScreen("select");
  };

  const saveMatch = async (s1, s2) => {
    const a = index.byId.get(match.aId);
    const b = index.byId.get(match.bId);
    if (!a || !b) return;
    const before = matchupGames(index.games, a.id, b.id);
    setSaving(true);
    setSaveError("");
    try {
      await apiFetch("/api/games", { method: "POST", body: JSON.stringify({ p1Id: a.id, p2Id: b.id, p1Score: s1, p2Score: s2 }) });
    } catch (err) {
      setSaving(false);
      setSaveError(err.message || "Couldn't save that game. Check your connection and try again.");
      sfx.deny();
      return;
    }
    setSaving(false);
    writeStoredMatch(null);
    const winner = s1 > s2 ? 1 : 2;
    const wName = winner === 1 ? a.name : b.name;
    const lName = winner === 1 ? b.name : a.name;
    const variant = pickVariant(buildCtx(before, winner, s1, s2), wName, lName);
    setKo({ aId: a.id, bId: b.id, s1, s2, winner, variant });
    setMatch(null);
    setScreen("ko");
    load().catch(() => {});
  };

  const rematch = () => {
    setSel({ p1: ko.aId, p2: ko.bId });
    setMatch({ aId: ko.aId, bId: ko.bId, s1: 0, s2: 0 });
    setKo(null);
    setScreen("versus");
  };

  const deleteGame = async (id) => {
    setRaw((r) => (r ? { ...r, games: r.games.filter((g) => g.id !== id) } : r));
    try {
      await apiFetch(`/api/games/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* the reload below restores it if the delete didn't land */
    }
    load().catch(() => {});
  };

  /* ---------------------------- fighters --------------------------- */

  const openAdd = (side) => setSheet({ mode: "add", side: side ?? null });
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
        const side = opened.side ?? (!cur.p1 ? "p1" : !cur.p2 ? "p2" : null);
        return side ? { ...cur, [side]: player.id } : cur;
      });
    }
    load().catch(() => {});
  };

  const onSheetDeleted = (id) => {
    setSheet(null);
    setRaw((r) => (r ? { players: r.players.filter((p) => p.id !== id), games: r.games.filter((g) => g.p1Id !== id && g.p2Id !== id) } : r));
    load().catch(() => {});
  };

  /* ----------------------------- render ---------------------------- */

  const p1 = sel.p1 ? index.byId.get(sel.p1) : null;
  const p2 = sel.p2 ? index.byId.get(sel.p2) : null;
  const matchA = match ? index.byId.get(match.aId) : null;
  const matchB = match ? index.byId.get(match.bId) : null;
  const koA = ko ? index.byId.get(ko.aId) : null;
  const koB = ko ? index.byId.get(ko.bId) : null;
  const sheetPlayer = sheet?.player ? index.byId.get(sheet.player.id) ?? sheet.player : null;

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
            <RecordsScreen index={index} sel={sel} onBack={() => setScreen("select")} onEdit={openEdit} onAdd={() => openAdd(null)} onDeleteGame={deleteGame} />
          )}
          {screen === "versus" && p1 && p2 && (
            <VersusScreen a={p1} b={p2} onDone={afterVersus} />
          )}
          {screen === "match" && matchA && matchB && (
            <MatchScreen
              a={matchA}
              b={matchB}
              initial={match}
              round={headToHead(index.games, matchA.id, matchB.id).total + 1}
              onChange={onMatchChange}
              onSave={saveMatch}
              onQuit={quitMatch}
              saving={saving}
              error={saveError}
            />
          )}
          {screen === "ko" && ko && koA && koB && (
            <KOScreen
              winner={ko.winner === 1 ? koA : koB}
              loser={ko.winner === 1 ? koB : koA}
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
          gameCount={sheetPlayer ? index.games.filter((g) => g.p1Id === sheetPlayer.id || g.p2Id === sheetPlayer.id).length : 0}
          onClose={() => setSheet(null)}
          onSaved={onSheetSaved}
          onDeleted={onSheetDeleted}
        />
      )}
    </div>
  );
}
