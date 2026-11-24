import { useEffect, useRef, useState } from "react";
import { FxText } from "../components/FxText.jsx";
import { Portrait } from "../components/Portrait.jsx";
import { PadButton, PadGlyph, SCORE_MAX, SCORE_MIN, ScoreRuler } from "../components/ScoreDial.jsx";
import { haptic, sfx } from "../lib/sfx.js";
import { useSpine } from "../lib/spine.js";
import { teamName } from "../lib/stats.js";

const clamp = (n) => Math.max(SCORE_MIN, Math.min(SCORE_MAX, n));
const GAME_TO = 11;

/**
 * Holding + jumps to the score that wins from here: 11, or 2 clear of the
 * opponent once they reach 10. null when there's nothing to win (already
 * won, or the opponent already has).
 */
function winningScore(mine, opp) {
  if (opp >= GAME_TO && opp - mine >= 2) return null;
  const target = Math.max(GAME_TO, opp + 2);
  return mine < target ? target : null;
}

/** Health = how far the opponent is from 11. Deuce leaves both on a sliver. */
function healthFor(mine, opp, decisive) {
  if (decisive && opp > mine) return 0;
  if (mine >= 10 && opp >= 10) return mine >= opp ? 0.12 : 0.05;
  return Math.max(0, 11 - opp) / 11;
}

function useWakeLock() {
  useEffect(() => {
    let lock = null;
    let active = true;
    const request = async () => {
      try { lock = await navigator.wakeLock?.request("screen"); } catch { /* unsupported or denied */ }
    };
    request();
    const onVisible = () => { if (active && document.visibilityState === "visible") request(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release?.().catch(() => {});
    };
  }, []);
}

function HealthBar({ side, value, hitKey }) {
  const ref = useRef(null);
  const pct = `${Math.round(value * 100)}%`;
  useEffect(() => {
    if (!hitKey || !ref.current?.animate) return;
    const skew = side === 1 ? -20 : 20;
    ref.current.animate(
      [
        { transform: `skewX(${skew}deg) translate(0, 0)` },
        { transform: `skewX(${skew}deg) translate(-4px, 2px)`, filter: "brightness(2)" },
        { transform: `skewX(${skew}deg) translate(4px, -1px)` },
        { transform: `skewX(${skew}deg) translate(0, 0)` },
      ],
      { duration: 220, easing: "ease-out" }
    );
  }, [hitKey, side]);
  return (
    <div ref={ref} className={`hp ${side === 1 ? "hp-l" : "hp-r"}`}>
      <div className="hp-trail" style={{ width: pct }} />
      <div className={`hp-fill ${value <= 0.28 ? "low" : ""}`} style={{ width: pct }} />
    </div>
  );
}

/** Big score readout. Tap it to type a number directly. */
function ScoreReadout({ side, name, score, sparks, disabled, onType }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const tone = side === 1 ? "p1" : "p2";

  const commit = () => {
    setEditing(false);
    const n = parseInt(draft, 10);
    if (!Number.isNaN(n)) onType(side, clamp(n));
  };

  if (editing) {
    return (
      <div className="flex h-[clamp(110px,30vw,210px)] items-center justify-center">
        <input
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          autoFocus
          aria-label={`Type ${name}'s score`}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 2))}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
            if (e.key === "Escape") setEditing(false);
          }}
          className="font-display w-full border-2 border-black bg-black/70 text-center text-[clamp(84px,26vw,180px)] leading-none text-white shadow-[0_0_0_2px_var(--tone)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => { setDraft(String(score)); setEditing(true); }}
      aria-label={`${name}: ${score}. Tap to type a score.`}
      className="relative flex h-[clamp(110px,30vw,210px)] w-full cursor-text flex-col items-center justify-center"
    >
      <span key={score} className="score-slam-in inline-block">
        <FxText tone={tone} style={{ fontSize: "clamp(96px, 30vw, 200px)" }}>{score}</FxText>
      </span>
      {sparks.map((s) => (
        <span key={s.id} className="pointer-events-none" aria-hidden="true">
          <span className="spark" style={{ left: "50%", top: "50%" }} />
          <span className="plus-one font-display text-[44px] text-white" style={{ left: "62%", top: "40%", textShadow: "0 3px 0 #000, 0 0 18px var(--tone)" }}>+{s.n}</span>
        </span>
      ))}
    </button>
  );
}

/*
 * Both sides' faces behind the score zones, each cropped along the same
 * slanted seam the divider line draws (top at 55%, bottom at 45%), so the
 * photos meet exactly on the line instead of at a vertical edge. In
 * doubles it's whoever is on point; a tag slides the partner's face in.
 */
const SEAM_TOP = 55;
const SEAM_BOTTOM = 45;
const FACE_MASK = "linear-gradient(to bottom, #000 30%, transparent 88%)";

function Backdrop({ a, b, tagged }) {
  const half = (side, player) => {
    const left = side === 1;
    const clip = left
      ? `polygon(0 0, ${SEAM_TOP}% 0, ${SEAM_BOTTOM}% 100%, 0 100%)`
      : `polygon(${SEAM_TOP}% 0, 100% 0, 100% 100%, ${SEAM_BOTTOM}% 100%)`;
    return (
      <div className={`tone-p${side} pointer-events-none absolute inset-0`} style={{ clipPath: clip }} aria-hidden="true">
        <div className="absolute inset-0" style={{ background: `linear-gradient(${left ? "135deg" : "225deg"}, color-mix(in srgb, var(--tone-deep) 85%, transparent), color-mix(in srgb, var(--tone-deep) 35%, transparent) 70%, transparent)` }} />
        <div
          className={`absolute inset-y-0 ${left ? "left-0" : "right-0"} w-[55%] opacity-30 grayscale`}
          style={{ maskImage: FACE_MASK, WebkitMaskImage: FACE_MASK }}
        >
          <div key={player.id} className={`h-full w-full ${tagged[side] ? `tag-swap-${left ? "l" : "r"}` : ""}`}><Portrait player={player} /></div>
        </div>
      </div>
    );
  };
  return (
    <>
      {half(1, a)}
      {half(2, b)}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ filter: "drop-shadow(0 0 8px rgba(255,210,63,.75))" }} aria-hidden="true">
        <line x1={`${SEAM_TOP}%`} y1="0" x2={`${SEAM_BOTTOM}%`} y2="100%" stroke="rgba(255,255,255,.8)" strokeWidth="3" />
      </svg>
    </>
  );
}

/** Doubles: bring the partner in. Shows who's waiting on the apron. */
function TagButton({ side, partner, disabled, onTag }) {
  return (
    <button
      type="button"
      onClick={() => onTag(side)}
      disabled={disabled}
      aria-label={`Tag in ${partner.name}`}
      className="tag-btn mx-auto mt-5 flex max-w-full items-center gap-2.5 py-1.5 pl-2 pr-4 disabled:opacity-30 active:scale-95"
    >
      <span className="relative block h-9 w-7 shrink-0 overflow-hidden border-2 border-black">
        <Portrait key={partner.id} player={partner} />
      </span>
      <span className="flex min-w-0 flex-col items-start">
        <span className="font-hud text-[13px] font-semibold leading-none text-white/60">TAG IN</span>
        <span className="font-hud mt-0.5 max-w-full truncate text-[20px] font-bold leading-none text-white">{partner.name.toUpperCase()}</span>
      </span>
    </button>
  );
}

function Zone({ side, team, score, opp, combo, sparks, tagKey, disabled, onBump, onJump, onDragTo, onType, onTag }) {
  const target = winningScore(score, opp);
  const tone = side === 1 ? "p1" : "p2";
  const name = teamName(team);
  return (
    <section aria-label={`${name}'s score`} className={`zone tone-${tone} flex flex-col items-center justify-center px-3`}>

      {tagKey > 0 && (
        <div key={tagKey} className="tag-pop pointer-events-none absolute inset-x-0 top-[13%] z-10 flex justify-center" aria-hidden="true">
          <FxText tone={tone} className="text-[clamp(44px,14vw,84px)]">Tag!</FxText>
        </div>
      )}

      {combo >= 2 && (
        <div key={combo} className="status-pop font-hud pointer-events-none absolute top-[12%] text-center text-[24px] font-bold text-[var(--accent)]" style={{ textShadow: "0 2px 0 #000, 0 0 16px rgba(255,160,40,.8)" }}>
          {combo} POINT RUN
        </div>
      )}

      <div className="zone-stack relative flex w-full max-w-[340px] flex-col items-center">
        <ScoreReadout side={side} name={name} score={score} sparks={sparks} disabled={disabled} onType={onType} />

        <div className="zone-pads mt-4 grid w-full grid-cols-2 gap-3 px-1">
          <PadButton label={`Take a point from ${name}`} disabled={disabled || score <= SCORE_MIN} onPress={() => onBump(side, -1)}><PadGlyph /></PadButton>
          <PadButton
            label={target ? `Point for ${name}. Hold to jump to ${target}.` : `Point for ${name}`}
            disabled={disabled || score >= SCORE_MAX}
            onPress={() => onBump(side, 1)}
            onHold={target ? () => onJump(side, target) : undefined}
          >
            <PadGlyph plus />
          </PadButton>
        </div>

        <div className="mt-5 w-full px-1">
          <ScoreRuler value={score} label={`${name} score`} disabled={disabled} onDragTo={(v, first) => onDragTo(side, v, first)} />
        </div>

        {team[1] && <TagButton side={side} partner={team[1]} disabled={disabled} onTag={onTag} />}
      </div>
    </section>
  );
}

/**
 * HUD portrait. In doubles the fighter on point fills it and their
 * partner rides on the outside corner, like a tag-team assist.
 */
function HudFace({ side, team, tagged }) {
  const lean = side === 1 ? "-20deg" : "20deg";
  const [front, mate] = team;
  return (
    <div className={`tone-p${side} relative h-12 w-12 shrink-0`}>
      <div className="hud-face absolute inset-0 overflow-hidden border-2 border-black shadow-[0_0_0_2px_var(--tone)]" style={{ "--lean": lean }}>
        <div key={front.id} className={`unskew ${tagged ? "tag-in" : ""}`}><Portrait player={front} eager /></div>
      </div>
      {mate && (
        <div
          className={`hud-face absolute ${side === 1 ? "-left-2" : "-right-2"} top-[28px] h-[26px] w-[26px] overflow-hidden border-2 border-black shadow-[0_0_0_2px_var(--tone)]`}
          style={{ "--lean": lean }}
          aria-hidden="true"
        >
          <div key={mate.id} className={`unskew ${tagged ? "tag-in" : ""}`}><Portrait player={mate} /></div>
        </div>
      )}
    </div>
  );
}

/** HUD name line: the fighter on point, then their partner, dimmer. */
function HudName({ side, team }) {
  const color = side === 1 ? "var(--p1)" : "var(--p2)";
  return (
    <div className={`font-hud mt-1 truncate text-[17px] font-semibold ${side === 2 ? "text-right" : ""}`} style={{ color }}>
      {team[0].name.toUpperCase()}
      {team[1] && <span className="text-white/55"> &amp; {team[1].name.toUpperCase()}</span>}
    </div>
  );
}

/**
 * The scoreboard. `a` and `b` are teams: one fighter each in singles, two
 * in doubles, where team[0] is on point and onTag(side) swaps the pair.
 */
export function MatchScreen({ a, b, initial, round, onChange, onTag, onSave, onQuit, saving, error }) {
  const [score, setScore] = useState({ s1: initial?.s1 ?? 0, s2: initial?.s2 ?? 0 });
  const [hist, setHist] = useState([]);
  const [combo, setCombo] = useState({ side: 0, n: 0 });
  const [sparks, setSparks] = useState([]);
  const [hitKey, setHitKey] = useState({ 1: 0, 2: 0 });
  const [intro, setIntro] = useState(true);
  const [quitArmed, setQuitArmed] = useState(false);
  const [tagKey, setTagKey] = useState({ 1: 0, 2: 0 });
  const sparkId = useRef(0);
  const mainRef = useRef(null);
  const spine = useSpine();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useWakeLock();

  // Open phone turned upright: tell the zones where the spine crosses them
  // (--fold, from their top) so the score sits above it and the pads below.
  useEffect(() => {
    const el = mainRef.current;
    if (spine !== "h" || !el) return;
    const place = () => el.style.setProperty("--fold", `${window.innerHeight / 2 - el.getBoundingClientRect().top}px`);
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [spine]);

  useEffect(() => { onChangeRef.current(score); }, [score]);

  useEffect(() => {
    sfx.fight();
    const t = window.setTimeout(() => setIntro(false), 1200);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!quitArmed) return;
    const t = window.setTimeout(() => setQuitArmed(false), 2500);
    return () => window.clearTimeout(t);
  }, [quitArmed]);

  const { s1, s2 } = score;
  const lead = s1 - s2;
  const top = Math.max(s1, s2);
  const decisive = top >= GAME_TO && Math.abs(lead) >= 2;
  const leader = teamName(lead > 0 ? a : b);
  const leaderSide = lead > 0 ? 1 : 2;
  let status = null;
  if (decisive) status = { text: `${leader} — K.O.!`, side: leaderSide };
  else if (s1 >= 10 && s2 >= 10) status = lead === 0 ? { text: "DEUCE!", side: 0 } : { text: `ADVANTAGE ${leader}`, side: leaderSide };
  else if (top >= 10 && lead !== 0) status = { text: `GAME POINT ${leader}`, side: leaderSide };

  const keyOf = (side) => (side === 1 ? "s1" : "s2");
  const remember = () => setHist((h) => [...h.slice(-80), score]);

  /** Spark + "+n" on the scorer, a shake on the other side's health bar. */
  const hit = (side, n) => {
    const opp = side === 1 ? 2 : 1;
    setHitKey((k) => ({ ...k, [opp]: k[opp] + 1 }));
    const id = ++sparkId.current;
    setSparks((sp) => [...sp.slice(-6), { id, side, n }]);
    window.setTimeout(() => setSparks((sp) => sp.filter((s) => s.id !== id)), 700);
    sfx.hit(side);
  };

  /** −/+ pad: +1 is a "hit" (spark, health damage, point run); −1 is a correction. */
  const bump = (side, delta) => {
    const key = keyOf(side);
    const next = clamp(score[key] + delta);
    if (next === score[key]) return;
    remember();
    setScore((s) => ({ ...s, [key]: next }));
    if (delta > 0) {
      setCombo((c) => (c.side === side ? { side, n: c.n + 1 } : { side, n: 1 }));
      hit(side, delta);
      haptic(14);
    } else {
      setCombo({ side: 0, n: 0 });
      sfx.undo();
      haptic(6);
    }
  };

  /** Holding +: jump straight to the winning score in one undo step. */
  const jump = (side, value) => {
    const key = keyOf(side);
    if (value <= score[key]) return;
    remember();
    setScore((s) => ({ ...s, [key]: value }));
    setCombo({ side: 0, n: 0 });
    hit(side, value - score[key]);
    haptic([18, 40, 28]);
  };

  /** Ruler drag: one undo step per gesture; ticks are handled by the ruler. */
  const dragTo = (side, value, first) => {
    const key = keyOf(side);
    if (first) remember();
    setScore((s) => (s[key] === value ? s : { ...s, [key]: value }));
    setCombo({ side: 0, n: 0 });
  };

  const typeScore = (side, value) => {
    const key = keyOf(side);
    if (value === score[key]) return;
    remember();
    setScore((s) => ({ ...s, [key]: value }));
    setCombo({ side: 0, n: 0 });
  };

  const undo = () => {
    if (!hist.length) return;
    setScore(hist[hist.length - 1]);
    setHist((h) => h.slice(0, -1));
    setCombo({ side: 0, n: 0 });
    sfx.undo();
    haptic(6);
  };

  /** Doubles tag: the partner takes point (purely for show; the score is the team's). */
  const tag = (side) => {
    setTagKey((k) => ({ ...k, [side]: k[side] + 1 }));
    sfx.tag(side);
    haptic([12, 30, 18]);
    onTag(side);
  };

  const quit = () => {
    if (s1 + s2 === 0 || quitArmed) { onQuit(); return; }
    setQuitArmed(true);
    sfx.deny();
  };

  // Pickleball: first to 11, win by 2. SAVE stays locked until someone has won.
  const canSave = decisive && !saving;
  const hp1 = healthFor(s1, s2, decisive);
  const hp2 = healthFor(s2, s1, decisive);

  return (
    <div className="no-select fixed inset-0 z-30 flex flex-col">
      {/* HUD */}
      <header className="pad-x relative z-10 pt-[calc(env(safe-area-inset-top)+10px)] [--pad:12px]">
        <div className="flex items-center gap-2">
          <HudFace side={1} team={a} tagged={tagKey[1] > 0} />
          <div className="min-w-0 flex-1">
            <HealthBar side={1} value={hp1} hitKey={hitKey[1]} />
            <HudName side={1} team={a} />
          </div>
          <div className="hud-badge h-12 w-[76px] shrink-0 bg-white/35 p-[2px]">
            <div className="hud-badge h-full w-full bg-black p-[2px]">
              <div className="hud-badge flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-[#2a1f4d] to-[#0b0618]">
                <span className="font-hud text-[11px] font-semibold text-white/60">GAME</span>
                <span className="font-display text-[22px] leading-none text-[var(--accent)]">{round}</span>
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1 text-right">
            <HealthBar side={2} value={hp2} hitKey={hitKey[2]} />
            <HudName side={2} team={b} />
          </div>
          <HudFace side={2} team={b} tagged={tagKey[2] > 0} />
        </div>
      </header>

      {/* Score zones */}
      <main ref={mainRef} className="match-main relative mt-2 grid flex-1 grid-cols-2 overflow-hidden">
        <Backdrop a={a[0]} b={b[0]} tagged={{ 1: tagKey[1] > 0, 2: tagKey[2] > 0 }} />
        <Zone side={1} team={a} score={s1} opp={s2} combo={combo.side === 1 ? combo.n : 0} sparks={sparks.filter((s) => s.side === 1)} tagKey={tagKey[1]}
          disabled={saving} onBump={bump} onJump={jump} onDragTo={dragTo} onType={typeScore} onTag={tag} />
        <Zone side={2} team={b} score={s2} opp={s1} combo={combo.side === 2 ? combo.n : 0} sparks={sparks.filter((s) => s.side === 2)} tagKey={tagKey[2]}
          disabled={saving} onBump={bump} onJump={jump} onDragTo={dragTo} onType={typeScore} onTag={tag} />

        {status && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center" aria-live="polite">
            <div key={status.text} className="status-pop bg-black/75 px-4 pb-1 pt-2" style={{ boxShadow: `0 0 0 2px ${status.side === 1 ? "var(--p1)" : status.side === 2 ? "var(--p2)" : "var(--accent)"}` }}>
              <span className="font-hud block text-[24px] font-bold leading-none" style={{ color: status.side === 1 ? "var(--p1)" : status.side === 2 ? "var(--p2)" : "var(--accent)" }}>
                {status.text.toUpperCase()}
              </span>
            </div>
          </div>
        )}

        {intro && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
            <div className="banner-zoom flex flex-col items-center">
              <span className="font-hud text-[28px] font-bold text-white" style={{ textShadow: "0 2px 0 #000" }}>GAME {round}</span>
              <FxText className="text-[min(26vw,150px)]" glow="#ff6a00">Fight!</FxText>
            </div>
          </div>
        )}
      </main>

      {/* Controls */}
      <footer className="match-foot book-pages pad-x relative z-10 bg-gradient-to-t from-black via-black/90 to-black/40 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 [--pad:12px]">
        {error && <p className="mb-2 text-center text-sm font-bold text-[var(--p2)]" role="alert">{error}</p>}
        <div className="match-controls flex items-stretch gap-2">
          <div className="match-controls-left">
          <button type="button" onClick={quit} disabled={saving} className={`font-hud slant-btn shrink-0 px-4 pb-1 pt-2.5 text-[19px] font-semibold active:scale-95 ${quitArmed ? "bg-[var(--p2)] text-white" : "bg-white/12 text-white/80"}`}>
            {quitArmed ? "QUIT?" : "QUIT"}
          </button>
          <button type="button" onClick={undo} disabled={!hist.length || saving} className="font-hud slant-btn shrink-0 bg-white/12 px-4 pb-1 pt-2.5 text-[19px] font-semibold text-white/80 disabled:opacity-35 active:scale-95">
            UNDO
          </button>
          </div>
          <div className={`min-w-0 flex-1 ${canSave ? "fight-ready" : ""}`}>
            <button
              type="button"
              onClick={() => canSave && onSave(s1, s2)}
              disabled={!canSave}
              className={`slant-btn block h-full w-full py-2.5 active:scale-[0.98] ${canSave ? "bg-gradient-to-b from-[#fff3a0] via-[#ffc02e] to-[#ff5a1f]" : "bg-white/10"}`}
            >
              <span className={`font-display block truncate px-2 text-[24px] leading-none ${canSave ? "text-[var(--ink)]" : "text-white/35"}`} style={{ transform: "skewX(-9deg)" }}>
                {saving ? "SAVING…" : decisive ? `K.O.! SAVE ${s1}–${s2}` : `${s1}–${s2}`}
              </span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
