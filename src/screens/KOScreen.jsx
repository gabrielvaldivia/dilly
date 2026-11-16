import { useEffect, useState } from "react";
import { FxText } from "../components/FxText.jsx";
import { IconCaretDown, IconStar } from "../components/Icons.jsx";
import { Portrait } from "../components/Portrait.jsx";
import { beatenUrl } from "../lib/api.js";
import { ensureBeaten } from "../lib/beaten.js";
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

function Card({ player, tone, children, className = "", art = null }) {
  return (
    <div className={`tone-${tone} relative aspect-[4/5] w-full ${className}`}>
      <div className="absolute inset-0 overflow-hidden border-[3px] border-black" style={{ transform: "skewX(-6deg)", boxShadow: "0 0 0 3px var(--tone), 0 18px 40px rgba(0,0,0,.6)" }}>
        <div className="absolute inset-[-2px_-10%]" style={{ transform: "skewX(6deg)" }}>
          {art ? <img src={art} alt="" draggable={false} className="h-full w-full object-cover" /> : <Portrait player={player} eager initialSize="60cqw" />}
        </div>
        {children}
      </div>
    </div>
  );
}

const DIZZY_LOOP = 2.6; // seconds per orbit

/**
 * Stars circling the loser's head, drawn in front of the card. Each star
 * slides side to side and up/down on two eased loops a quarter-turn apart,
 * which traces an ellipse without ever rotating the star — so they stay
 * upright and are a touch bigger on the near side of the orbit.
 */
function DizzyStars() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-[7%] z-20 h-0 w-0" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="dizzy-x" style={{ animationDelay: `${(-i * DIZZY_LOOP) / 3}s` }}>
          <span className="dizzy-y" style={{ animationDelay: `${(-i * DIZZY_LOOP) / 3 - DIZZY_LOOP / 4}s` }}>
            <IconStar className="dizzy-star" />
          </span>
        </span>
      ))}
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

  // The loser's generated beaten-up portrait. If it isn't ready yet, show
  // the drawn-on bruises now and swap the art in once it's generated.
  const [art, setArt] = useState(() => beatenUrl(loser));
  useEffect(() => {
    if (art || !loser.photo) return;
    let live = true;
    ensureBeaten(loser).then((p) => {
      const url = p && beatenUrl(p);
      if (!url || !live) return;
      const img = new Image();
      img.onload = () => { if (live) setArt(url); };
      img.src = url;
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      className="no-select fixed inset-x-0 top-0 z-50 h-dvh overflow-hidden"
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
        <div className="relative mx-auto flex h-full w-full max-w-[860px] flex-col items-center px-5 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-[calc(env(safe-area-inset-top)+14px)]">
          {/* Result */}
          <div className="fade-up flex shrink-0 flex-col items-center text-center">
            <FxText tone={wTone} style={{ fontSize: `min(${Math.min(14, 140 / (winner.name.length + 5))}vw, 64px)` }}>{winner.name} wins</FxText>
            <div className="mt-2 flex items-center gap-3">
              <span className="font-display text-[clamp(34px,9vw,48px)] leading-none text-[var(--accent)]" style={{ textShadow: "0 3px 0 #000" }}>
                {Math.max(s1, s2)}–{Math.min(s1, s2)}
              </span>
              <span className="font-hud border-2 border-[var(--accent)] px-2.5 pb-0.5 pt-1.5 text-[16px] font-bold text-[var(--accent)]">{variant.name}</span>
            </div>
          </div>

          {/* The loser, beaten up — the winner gets the headline, not a portrait. */}
          <div className="ko-card-area relative flex min-h-0 w-full flex-1 items-center justify-center py-4">
          <div className="ko-loser-in relative" style={{ "--card-w": "min(78cqw, 66cqh, 340px)", width: "var(--card-w)" }}>
            <Card player={loser} tone={lTone} className={`ko-beaten ${art ? "has-art" : ""}`} art={art}>
              {!art && (
                <>
                  <div className="beat-up pointer-events-none absolute inset-0" />
                  <span className="bandage bandage-a" aria-hidden="true" />
                  <span className="bandage bandage-b" aria-hidden="true" />
                  <svg className="pointer-events-none absolute left-0 top-0 h-1/2 w-1/2 opacity-70" viewBox="0 0 100 100" aria-hidden="true">
                    <path d="M0 18 L22 30 L30 12 L44 34 L60 26 M22 30 L18 52 M44 34 L40 60 L58 74" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="bevel" />
                  </svg>
                </>
              )}
              {art && <div key={art} className="shutter-flash pointer-events-none absolute inset-0 bg-white" aria-hidden="true" />}
              <span className="ko-stamp font-display" aria-hidden="true">K.O.</span>
            </Card>
            <DizzyStars />
          </div>
          </div>

          {/* The excuse */}
          <div className="fade-up relative mt-3 w-full max-w-[560px] shrink-0" style={{ animationDelay: ".5s" }}>
            <span className={`tone-${lTone} font-hud absolute -top-3.5 left-4 z-10 px-2.5 pb-0.5 pt-1 text-[16px] font-bold text-black`} style={{ background: "var(--tone)", transform: "skewX(-12deg)" }}>
              {loser.name.toUpperCase()}
            </span>
            <div className="min-h-[84px] border-2 border-white/85 bg-black/80 px-5 pb-3 pt-5 shadow-[0_0_0_2px_#000,0_12px_40px_rgba(0,0,0,.6)]">
              <p className="font-hud text-[clamp(21px,min(5.6vw,3.4dvh),30px)] font-semibold leading-[1.08] text-white">
                “{typing.shown}{typing.done ? "”" : ""}
                {typing.done && <span className="blink ml-2 inline-block align-middle text-[var(--accent)]" aria-hidden="true"><IconCaretDown className="h-[0.5em] w-[0.5em]" /></span>}
              </p>
            </div>
          </div>

          {/* Next */}
          <div className="fade-up w-full max-w-[520px] shrink-0 pt-5" style={{ animationDelay: ".7s" }}>
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
