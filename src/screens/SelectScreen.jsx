import { useMemo, useState } from "react";
import { FxText } from "../components/FxText.jsx";
import { Globe } from "../components/Globe.jsx";
import { ModeSwitch } from "../components/ModeSwitch.jsx";
import { Portrait } from "../components/Portrait.jsx";
import { gamesFor, headToHead, playerRecord } from "../lib/stats.js";
import { haptic, sfx } from "../lib/sfx.js";

/*
 * Selection slots. Singles fills p1 and p2; doubles also fills each side's
 * partner, p1b and p2b — picked in team order, 1P's pair first. Partners
 * stay remembered (just hidden) while in singles.
 */
export const SLOTS = { singles: ["p1", "p2"], doubles: ["p1", "p1b", "p2", "p2b"] };
export const ALL_SLOTS = SLOTS.doubles;
const sideOf = (slot) => slot.slice(0, 2);

const SIDE_LABEL = { p1: "PLAYER 1", p2: "PLAYER 2" };

function nameSize(name) {
  return `${Math.min(30, 140 / Math.max(1, name.length))}cqw`;
}

export function PreviewPanel({ side, player, record, active, dimmed, slamKey, onFocus, onEdit, badge, label }) {
  const isP1 = side === "p1";
  const title = label ?? SIDE_LABEL[side];
  return (
    <div
      className={`tone-${side} relative h-full transition-[opacity,filter] duration-300 ${dimmed ? "opacity-40 saturate-[.35]" : ""}`}
      style={{ containerType: "inline-size" }}
    >
      {/* The tilted panel. The 1P/2P badge and EDIT live inside it so they
          turn with the panel instead of floating off its edges. */}
      <div className={`preview preview-${side} relative h-full w-full ${active ? "panel-focus" : ""}`}>
      <button
        type="button"
        onClick={onFocus}
        aria-label={player ? `${title}: ${player.name}` : `${title}: empty`}
        className="block h-full w-full"
      >
        <div
          key={slamKey}
          className={`${slamKey ? "panel-slam" : ""} ${isP1 ? "slant-l" : "slant-r"} relative h-full w-full overflow-hidden`}
          style={{ background: "linear-gradient(180deg, var(--tone-deep), #05020a)" }}
        >
          {player ? (
            <Portrait player={player} eager />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <svg viewBox="0 0 100 125" className="absolute inset-x-0 bottom-0 h-[78%] w-full opacity-60" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
                <circle cx="50" cy="45" r="20" fill="#000" />
                <path d="M10 125 C12 90 30 72 50 72 C70 72 88 90 90 125 Z" fill="#000" />
              </svg>
              <span className="relative font-display text-[34cqw] leading-none text-white/25">?</span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to top, var(--tone-deep) 0%, rgba(0,0,0,.25) 38%, transparent 60%)" }} />
          <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 40px color-mix(in srgb, var(--tone) 45%, transparent)" }} />
          {/* Border traced on the same slanted outline as the clip, so it runs
              along the angled edge too. The outer half of the stroke is
              clipped away, leaving a 3px line inside the shape. */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon
              points={isP1 ? "0,0 100,0 88,100 0,100" : "0,0 100,0 100,100 12,100"}
              fill="none"
              strokeWidth="6"
              strokeLinejoin="miter"
              vectorEffect="non-scaling-stroke"
              style={{ stroke: "var(--tone)" }}
            />
          </svg>
          {player && (
            <div className={`absolute bottom-2 ${isP1 ? "left-2 text-left" : "right-2 text-right"} max-w-[92%]`}>
              <FxText tone={side} style={{ fontSize: nameSize(player.name) }}>{player.name}</FxText>
              <div className="font-hud mt-1 text-[15px] font-semibold text-white/85">
                {record.played ? `${record.wins}W · ${record.losses}L` : "ROOKIE"}
              </div>
            </div>
          )}
        </div>
      </button>
      <span
        className={`font-hud pointer-events-none absolute -top-2.5 ${isP1 ? "left-1" : "right-1"} px-2 pt-0.5 text-[18px] font-bold text-black`}
        style={{ background: "var(--tone)", transform: "skewX(-12deg)", boxShadow: "0 0 16px var(--tone)" }}
      >
        {badge ?? (isP1 ? "1P" : "2P")}
      </span>
      {player && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${player.name}`}
          className={`font-hud absolute top-3 z-10 ${isP1 ? "right-3" : "left-3"} rounded-sm bg-black/60 px-2 pb-0.5 pt-1 text-[14px] font-semibold text-white/85 active:scale-95`}
        >
          EDIT
        </button>
      )}
      </div>
    </div>
  );
}

export function SelectScreen({ index, mode, onMode, sel, setSel, onFight, onAdd, onEdit, onRecords, muted, onToggleMute }) {
  const [focus, setFocus] = useState(null);
  const [slam, setSlam] = useState({ p1: 0, p1b: 0, p2: 0, p2b: 0 });
  const [denied, setDenied] = useState(0);
  const { players, byId } = index;
  const doubles = mode === "doubles";
  const slots = SLOTS[mode];
  const games = gamesFor(index, doubles ? 2 : 1);
  const fighterIn = (slot) => (sel[slot] ? byId.get(sel[slot]) ?? null : null);
  const focused = focus && slots.includes(focus) ? focus : null;
  const active = focused ?? slots.find((k) => !sel[k]) ?? null;
  const ready = slots.every((k) => sel[k]);

  const records = useMemo(
    () => Object.fromEntries(slots.map((k) => [k, sel[k] ? playerRecord(games, sel[k]) : null])),
    [games, sel, slots]
  );
  const h2h = useMemo(() => {
    if (!ready) return null;
    return doubles ? headToHead(games, [sel.p1, sel.p1b], [sel.p2, sel.p2b]) : headToHead(games, sel.p1, sel.p2);
  }, [games, sel, ready, doubles]);
  // Which side each picked fighter is on, for their card on the globe.
  const picks = useMemo(() => new Map(slots.filter((k) => sel[k]).map((k) => [sel[k], sideOf(k)])), [sel, slots]);

  const bang = (...picked) => setSlam((s) => ({ ...s, ...Object.fromEntries(picked.map((k) => [k, s[k] + 1])) }));

  const pick = (id) => {
    const holder = slots.find((k) => sel[k] === id);
    // Focused slot + a fighter already picked elsewhere: they trade places.
    if (focused && holder && holder !== focused) {
      setSel({ ...sel, [focused]: id, [holder]: sel[focused] });
      setFocus(null);
      bang(focused, holder);
      sfx.select(sideOf(focused) === "p1" ? 1 : 2);
      haptic(14);
      return;
    }
    // Tapping a picked fighter un-picks them and reopens their slot.
    if (holder) { setSel({ ...sel, [holder]: null }); setFocus(holder); sfx.undo(); haptic(6); return; }
    const slot = active ?? slots[slots.length - 1];
    const next = { ...sel, [slot]: id };
    // A fighter parked in a slot this mode hides (a partner, during singles) moves here.
    for (const k of ALL_SLOTS) if (k !== slot && next[k] === id) next[k] = null;
    setSel(next);
    setFocus(null);
    bang(slot);
    sfx.select(sideOf(slot) === "p1" ? 1 : 2);
    haptic(14);
  };

  const focusSlot = (slot) => {
    sfx.move();
    setFocus((f) => (f === slot ? null : slot));
  };

  const changeMode = (next) => {
    setFocus(null);
    onMode(next);
  };

  const fight = () => {
    if (!ready) { setDenied((n) => n + 1); sfx.deny(); haptic([30, 40, 30]); return; }
    onFight();
  };

  const panel = (slot) => {
    const side = sideOf(slot);
    const partner = slot !== side;
    const player = fighterIn(slot);
    return (
      <PreviewPanel
        side={side}
        player={player}
        record={records[slot]}
        active={active === slot}
        dimmed={active !== null && active !== slot}
        slamKey={slam[slot]}
        onFocus={() => focusSlot(slot)}
        onEdit={() => player && onEdit(player)}
        badge={partner ? "PARTNER" : undefined}
        label={partner ? `${SIDE_LABEL[side]} PARTNER` : undefined}
      />
    );
  };
  // Doubles: each side's pair stacked, tag-team style; the partner slides in.
  const team = (side) =>
    doubles ? (
      <div className="team-stack">
        <div className="team-slot">{panel(side)}</div>
        <div className={`team-slot team-in-${side}`}>{panel(`${side}b`)}</div>
      </div>
    ) : (
      panel(side)
    );

  return (
    <div className="no-select relative z-10 mx-auto flex h-dvh w-full max-w-[560px] flex-col overflow-y-clip px-4 pt-[calc(env(safe-area-inset-top)+8px)] lg:max-w-[1440px] lg:px-8">
      {/* Top bar */}
      <header className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="justify-self-start">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            aria-pressed={!muted}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-black/40 active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
              {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />}
            </svg>
          </button>
        </div>
        <div className="flex flex-col items-center">
          <FxText className="text-[clamp(36px,min(12vw,6.4dvh),68px)]" glow="#ff8a1f">Dilly</FxText>
          <span className="brand-plate relative z-10 -mt-[6px]">
            <span className="font-hud block whitespace-nowrap text-[clamp(13px,3.6vw,17px)] font-bold tracking-[0.22em] text-white">PICKLEBALL FIGHTERS</span>
          </span>
        </div>
        <div className="justify-self-end">
          <button type="button" onClick={onRecords} className="font-hud h-10 rounded-md border border-white/15 bg-black/40 px-3 pt-1 text-[18px] font-semibold active:scale-95">
            RECORDS
          </button>
        </div>
      </header>

      <div className="select-layout mt-4 min-h-0 flex-1 lg:mt-2">
        <section aria-label={doubles ? "Team 1" : "Player 1"} className="select-panel [grid-area:p1]">
          {team("p1")}
        </section>

        <div className="flex flex-col items-center justify-center [grid-area:vs] [perspective:500px] lg:hidden">
          <span className="vs-emblem inline-block"><FxText className="text-[40px]">VS</FxText></span>
          {h2h && h2h.total > 0 && (
            <div className="font-hud mt-2 text-center text-[15px] font-semibold leading-tight text-white/80">
              <span style={{ color: "var(--p1)" }}>{h2h.aWins}</span>
              <span className="text-white/40">–</span>
              <span style={{ color: "var(--p2)" }}>{h2h.bWins}</span>
            </div>
          )}
        </div>

        <section aria-label="Roster" className="globe-cell [grid-area:globe]">
          <Globe players={players} picks={picks} onPick={pick} onAdd={() => { sfx.move(); onAdd(active); }} />
        </section>

        <section aria-label={doubles ? "Team 2" : "Player 2"} className="select-panel [grid-area:p2]">
          {team("p2")}
        </section>
      </div>

      {/* Singles / doubles + Fight */}
      <div className="relative z-20 shrink-0 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
        <div className="mx-auto flex w-full max-w-[560px] items-stretch gap-2.5">
        <ModeSwitch mode={mode} onChange={changeMode} />
        <div key={denied} className={`relative min-w-0 flex-1 ${ready ? "fight-ready" : ""} ${denied ? "deny-shake" : ""}`}>
          <button
            type="button"
            onClick={fight}
            aria-disabled={!ready}
            className={`slant-btn block w-full py-[clamp(8px,1.4dvh,12px)] active:scale-[0.98] ${ready ? "bg-gradient-to-b from-[#fff3a0] via-[#ffc02e] to-[#ff5a1f]" : "bg-white/10"}`}
            style={{ "--slant": "22px" }}
          >
            <span className={`font-display block text-[clamp(30px,4.6dvh,38px)] leading-none tracking-wide ${ready ? "text-[var(--ink)]" : "text-white/35"}`} style={{ transform: "skewX(-9deg)" }}>
              FIGHT!
            </span>
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
