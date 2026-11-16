import { useEffect, useState } from "react";
import { FxText } from "../components/FxText.jsx";
import { Portrait } from "../components/Portrait.jsx";
import { pickExcuse } from "../lib/excuses.js";
import { haptic, sfx } from "../lib/sfx.js";

const KO_HOLD = 1300;
const TYPE_DELAY = 900;
const TYPE_SPEED = 30;

/** Reveal `text` one character at a time once `active`; `finish()` jumps to the end. */
function useTypewriter(text, active) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(text.length); return; }
    let i = 0;
    let timer = window.setTimeout(function tick() {
      i += 1;
      setN(i);
      if (i % 2 === 0) sfx.tick();
      if (i < text.length) timer = window.setTimeout(tick, TYPE_SPEED);
    }, TYPE_DELAY);
    return () => window.clearTimeout(timer);
  }, [active, text]);
  return { shown: text.slice(0, n), done: n >= text.length, finish: () => setN(text.length) };
}

function Card({ player, tone, children, className = "" }) {
  return (
    <div className={`tone-${tone} relative aspect-[4/5] w-full ${className}`}>
      <div className="absolute inset-0 overflow-hidden border-[3px] border-black" style={{ transform: "skewX(-6deg)", boxShadow: "0 0 0 3px var(--tone), 0 18px 40px rgba(0,0,0,.6)" }}>
        <div className="absolute inset-[-2px_-10%]" style={{ transform: "skewX(6deg)" }}>
          <Portrait player={player} eager initialSize="60cqw" />
        </div>
        {children}
      </div>
    </div>
  );
}

/** Stars circling the loser's head — a squashed ring, stars kept upright. */
function DizzyStars() {
  return (
    <div className="dizzy pointer-events-none absolute left-1/2 top-[2%] h-0 w-0" aria-hidden="true">
      <div className="dizzy-ring">
        {[0, 120, 240].map((a) => (
          <span key={a} className="dizzy-arm" style={{ transform: `rotate(${a}deg)` }}>
            <span className="dizzy-star">★</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Win screen: a short K.O. slam, then the classic aftermath — the winner
 * upright, the loser knocked crooked and roughed up, and the loser's
 * excuse typed out in a dialog box.
 */
export function KOScreen({ winner, loser, side, s1, s2, variant, onRematch, onSelect, onRecords }) {
  const [phase, setPhase] = useState("ko");
  const [quote] = useState(() => pickExcuse(variant.id, winner.name, loser.name));
  const reveal = phase === "reveal";
  const typing = useTypewriter(quote, reveal);
  const perfect = Math.min(s1, s2) === 0;
  const wTone = side === 1 ? "p1" : "p2";
  const lTone = side === 1 ? "p2" : "p1";
  const glow = side === 1 ? "34, 211, 255" : "255, 46, 85";

  useEffect(() => {
    sfx.ko();
    haptic([60, 40, 120]);
    const t = window.setTimeout(() => setPhase("reveal"), KO_HOLD);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!reveal) return;
    sfx.win();
    haptic([25, 50, 25]);
  }, [reveal]);

  return (
    <div
      className="no-select fixed inset-0 z-50 overflow-y-auto overflow-x-hidden"
      style={{ background: `radial-gradient(80% 60% at 28% 30%, rgba(${glow}, .18), transparent 65%), linear-gradient(180deg, rgba(8,5,18,.94), rgba(4,2,10,.97))` }}
      role="dialog"
      aria-modal="true"
      aria-label={`${winner.name} wins ${Math.max(s1, s2)} to ${Math.min(s1, s2)}. ${loser.name}: ${quote}`}
      onClick={() => (!reveal ? setPhase("reveal") : !typing.done && typing.finish())}
    >
      {!reveal && (
        <div className="screen-shake fixed inset-0 flex items-center justify-center" style={{ animationDelay: ".1s" }}>
          <span className="shockwave" style={{ animationDelay: ".15s" }} aria-hidden="true" />
          <div className="ko-slam">
            <FxText className={perfect ? "text-[min(22vw,150px)]" : "text-[min(40vw,260px)]"} glow="#ff3d2e">{perfect ? "Perfect!" : "K.O."}</FxText>
          </div>
          <div className="white-flash pointer-events-none fixed inset-0 bg-white" aria-hidden="true" />
        </div>
      )}

      {reveal && (
        <div className="relative mx-auto flex min-h-full w-full max-w-[860px] flex-col items-center justify-center px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[calc(env(safe-area-inset-top)+22px)]">
          {/* Result */}
          <div className="fade-up flex flex-col items-center text-center">
            <FxText tone={wTone} style={{ fontSize: `min(${Math.min(14, 140 / (winner.name.length + 5))}vw, 64px)` }}>{winner.name} wins</FxText>
            <div className="mt-2 flex items-center gap-3">
              <span className="font-display text-[clamp(34px,9vw,48px)] leading-none text-[var(--accent)]" style={{ textShadow: "0 3px 0 #000" }}>
                {Math.max(s1, s2)}–{Math.min(s1, s2)}
              </span>
              <span className="font-hud border-2 border-[var(--accent)] px-2.5 pb-0.5 pt-1.5 text-[16px] font-bold text-[var(--accent)]">{variant.name}</span>
            </div>
          </div>

          {/* The aftermath */}
          <div className="mt-7 grid w-full max-w-[640px] grid-cols-2 items-end gap-[clamp(16px,5vw,48px)]">
            <div className="ko-winner-in">
              <Card player={winner} tone={wTone}>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
              </Card>
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="font-hud bg-[var(--accent)] px-2 pb-0.5 pt-1 text-[15px] font-bold text-black" style={{ transform: "skewX(-10deg)" }}>WINNER</span>
                <span className="font-display truncate text-[20px] leading-none" style={{ color: `var(--${wTone})` }}>{winner.name.toUpperCase()}</span>
              </div>
            </div>

            <div className="ko-loser-in">
              <div className="relative">
                <DizzyStars />
                <Card player={loser} tone={lTone} className="ko-beaten">
                  <div className="beat-up pointer-events-none absolute inset-0" />
                  <span className="bandage bandage-a" aria-hidden="true" />
                  <span className="bandage bandage-b" aria-hidden="true" />
                  <svg className="pointer-events-none absolute left-0 top-0 h-1/2 w-1/2 opacity-70" viewBox="0 0 100 100" aria-hidden="true">
                    <path d="M0 18 L22 30 L30 12 L44 34 L60 26 M22 30 L18 52 M44 34 L40 60 L58 74" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="bevel" />
                  </svg>
                  <span className="ko-stamp font-display" aria-hidden="true">K.O.</span>
                </Card>
              </div>
              <div className="mt-8 flex items-center justify-center">
                <span className="font-display truncate text-[20px] leading-none text-white/55">{loser.name.toUpperCase()}</span>
              </div>
            </div>
          </div>

          {/* The excuse */}
          <div className="fade-up relative mt-8 w-full max-w-[640px]" style={{ animationDelay: ".5s" }}>
            <span className={`tone-${lTone} font-hud absolute -top-3.5 left-4 z-10 px-2.5 pb-0.5 pt-1 text-[16px] font-bold text-black`} style={{ background: "var(--tone)", transform: "skewX(-12deg)" }}>
              {loser.name.toUpperCase()}
            </span>
            <div className="min-h-[96px] border-2 border-white/85 bg-black/80 px-5 pb-4 pt-6 shadow-[0_0_0_2px_#000,0_12px_40px_rgba(0,0,0,.6)]">
              <p className="font-hud text-[clamp(23px,5.6vw,30px)] font-semibold leading-[1.08] text-white">
                “{typing.shown}{typing.done ? "”" : ""}
                {typing.done && <span className="blink ml-2 text-[0.7em] text-[var(--accent)]" aria-hidden="true">▼</span>}
              </p>
            </div>
          </div>

          {/* Next */}
          <div className="fade-up w-full max-w-[520px] pt-9" style={{ animationDelay: ".7s" }}>
            <div className="fight-ready">
              <button type="button" onClick={onRematch} className="slant-btn block w-full bg-gradient-to-b from-[#fff3a0] via-[#ffc02e] to-[#ff5a1f] py-3 active:scale-[0.98]" style={{ "--slant": "20px" }}>
                <span className="font-display block text-[32px] leading-none text-[var(--ink)]" style={{ transform: "skewX(-9deg)" }}>REMATCH</span>
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button type="button" onClick={onSelect} className="font-hud slant-btn bg-white/12 pb-1.5 pt-3 text-[20px] font-semibold text-white active:scale-95">NEW FIGHTERS</button>
              <button type="button" onClick={onRecords} className="font-hud slant-btn bg-white/12 pb-1.5 pt-3 text-[20px] font-semibold text-white active:scale-95">RECORDS</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
