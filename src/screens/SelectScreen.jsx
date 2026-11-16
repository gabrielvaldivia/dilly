import { useMemo, useState } from "react";
import { FxText } from "../components/FxText.jsx";
import { Globe } from "../components/Globe.jsx";
import { Portrait } from "../components/Portrait.jsx";
import { headToHead, playerRecord } from "../lib/stats.js";
import { haptic, sfx } from "../lib/sfx.js";

const SIDE_LABEL = { p1: "PLAYER 1", p2: "PLAYER 2" };

function nameSize(name) {
  return `${Math.min(30, 140 / Math.max(1, name.length))}cqw`;
}

function PreviewPanel({ side, player, record, active, slamKey, onFocus, onEdit }) {
  const isP1 = side === "p1";
  return (
    <div className={`tone-${side} relative h-full`} style={{ containerType: "inline-size" }}>
      {/* The tilted panel. The 1P/2P badge and EDIT live inside it so they
          turn with the panel instead of floating off its edges. */}
      <div className={`preview preview-${side} relative h-full w-full ${active ? "panel-focus" : ""}`}>
      <button
        type="button"
        onClick={onFocus}
        aria-label={player ? `${SIDE_LABEL[side]}: ${player.name}` : `${SIDE_LABEL[side]}: empty`}
        className="block h-full w-full"
      >
        <div
          key={slamKey}
          className={`${slamKey ? "panel-slam" : ""} ${isP1 ? "slant-l" : "slant-r"} relative h-full w-full overflow-hidden`}
          style={{ background: "linear-gradient(180deg, var(--tone-deep), #05020a)" }}
        >
          {player ? (
            <Portrait player={player} eager initialSize="60cqw" />
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
        {isP1 ? "1P" : "2P"}
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

export function SelectScreen({ index, sel, setSel, onFight, onAdd, onEdit, onRecords, muted, onToggleMute }) {
  const [focus, setFocus] = useState(null);
  const [slam, setSlam] = useState({ p1: 0, p2: 0 });
  const [denied, setDenied] = useState(0);
  const { players, games, byId } = index;
  const p1 = sel.p1 ? byId.get(sel.p1) : null;
  const p2 = sel.p2 ? byId.get(sel.p2) : null;
  const active = focus ?? (!p1 ? "p1" : !p2 ? "p2" : null);
  const ready = Boolean(p1 && p2);

  const rec1 = useMemo(() => (p1 ? playerRecord(games, p1.id) : null), [games, p1]);
  const rec2 = useMemo(() => (p2 ? playerRecord(games, p2.id) : null), [games, p2]);
  const h2h = useMemo(() => (ready ? headToHead(games, p1.id, p2.id) : null), [games, p1, p2, ready]);

  const pick = (id) => {
    const other = focus === "p1" ? "p2" : "p1";
    if (focus && sel[other] === id) {
      setSel({ [focus]: id, [other]: sel[focus] });
      setFocus(null);
      setSlam((s) => ({ p1: s.p1 + 1, p2: s.p2 + 1 }));
      sfx.select(focus === "p1" ? 1 : 2);
      haptic(14);
      return;
    }
    if (sel.p1 === id) { setSel({ ...sel, p1: null }); setFocus("p1"); sfx.undo(); haptic(6); return; }
    if (sel.p2 === id) { setSel({ ...sel, p2: null }); setFocus("p2"); sfx.undo(); haptic(6); return; }
    const side = active ?? "p2";
    setSel({ ...sel, [side]: id });
    setFocus(null);
    setSlam((s) => ({ ...s, [side]: s[side] + 1 }));
    sfx.select(side === "p1" ? 1 : 2);
    haptic(14);
  };

  const focusSide = (side) => {
    sfx.move();
    setFocus((f) => (f === side ? null : side));
  };

  const fight = () => {
    if (!ready) { setDenied((n) => n + 1); sfx.deny(); haptic([30, 40, 30]); return; }
    onFight();
  };

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
        <section aria-label="Player 1" className="select-panel [grid-area:p1]">
          <PreviewPanel side="p1" player={p1} record={rec1} active={active === "p1"} slamKey={slam.p1} onFocus={() => focusSide("p1")} onEdit={() => p1 && onEdit(p1)} />
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
          <Globe players={players} sel={sel} onPick={pick} onAdd={() => { sfx.move(); onAdd(active); }} />
        </section>

        <section aria-label="Player 2" className="select-panel [grid-area:p2]">
          <PreviewPanel side="p2" player={p2} record={rec2} active={active === "p2"} slamKey={slam.p2} onFocus={() => focusSide("p2")} onEdit={() => p2 && onEdit(p2)} />
        </section>
      </div>

      {/* Fight */}
      <div className="relative z-20 shrink-0 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
        <div key={denied} className={`relative mx-auto w-full max-w-[560px] ${ready ? "fight-ready" : ""} ${denied ? "deny-shake" : ""}`}>
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
  );
}
