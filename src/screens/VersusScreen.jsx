import { useEffect, useRef } from "react";
import { FxText } from "../components/FxText.jsx";
import { Portrait } from "../components/Portrait.jsx";
import { haptic, sfx } from "../lib/sfx.js";
import { teamName } from "../lib/stats.js";

const DURATION = 2900;
// The diagonal seam: where it meets the left and right screen edges (% of height).
const SEAM_LEFT = 60;
const SEAM_RIGHT = 40;

/**
 * An eased (S-curve) alpha mask: fully opaque until `from`%, then fading
 * along a cosine ease to transparent at `to`%, so the photo melts into the
 * background instead of ending on a hard linear ramp.
 */
function easedFade(direction, from, to, steps = 14) {
  const stops = ["#000 0%", `#000 ${from}%`];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const alpha = 0.5 + 0.5 * Math.cos(Math.PI * t);
    stops.push(`rgba(0,0,0,${alpha.toFixed(3)}) ${(from + (to - from) * t).toFixed(1)}%`);
  }
  stops.push(`transparent ${to}%`);
  return `linear-gradient(${direction}, ${stops.join(", ")})`;
}

const FADE_P1 = easedFade("to right", 38, 100);
const FADE_P2 = easedFade("to left", 38, 100);

const nameLen = (team) => ({ "--len": Math.max(3, ...team.map((p) => p.name.length)) });

/**
 * A side's photo: one fighter, or a tag team shoulder to shoulder with
 * the one on point on the wedge's tall side.
 */
function TeamArt({ team, tallSide }) {
  if (team.length < 2) return <Portrait player={team[0]} eager />;
  const ordered = tallSide === "left" ? team : [...team].reverse();
  return (
    <div className={`vs-duo vs-duo-${tallSide}`}>
      {ordered.map((p) => (
        <div key={p.id} className="vs-duo-cell"><Portrait player={p} eager /></div>
      ))}
    </div>
  );
}

/** Names on a wedge's short side: one per line for a team. */
function TeamNames({ team, tone }) {
  return team.map((p) => <FxText key={p.id} tone={tone}>{p.name}</FxText>);
}

/**
 * Pre-fight splash. Each side owns a diagonal wedge: their photo fills
 * half the screen on the wedge's tall side and fades into the background;
 * their name sits on the wedge's short side. VS slams in on the seam.
 * `a` and `b` are teams: one fighter each in singles, two in doubles.
 */
export function VersusScreen({ a, b, onDone }) {
  const duo = a.length > 1;
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  useEffect(() => {
    const hit = window.setTimeout(() => { sfx.vs(); haptic([40, 30, 60]); }, 450);
    const end = window.setTimeout(finish, DURATION);
    return () => { window.clearTimeout(hit); window.clearTimeout(end); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="no-select fixed inset-0 z-40 overflow-hidden bg-black"
      role="dialog"
      aria-label={`${teamName(a)} versus ${teamName(b)}`}
      onClick={finish}
    >
      <div className="screen-shake absolute inset-0" style={{ animationDelay: ".48s" }}>
        <div className="speedlines" aria-hidden="true" />

        {/* P1 — top wedge: tall on the left, short on the right */}
        <div className="vs-in-l absolute inset-0" style={{ clipPath: `polygon(0 0, 100% 0, 100% ${SEAM_RIGHT}%, 0 ${SEAM_LEFT}%)` }}>
          <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, var(--p1) -20%, var(--p1-deep) 40%, #020414 100%)" }} />
          <div className="vs-img vs-img-top left-0" style={{ maskImage: FADE_P1, WebkitMaskImage: FADE_P1 }}>
            <div className="vs-drift-l h-full w-full"><TeamArt team={a} tallSide="left" /></div>
          </div>
        </div>

        {/* P2 — bottom wedge: short on the left, tall on the right */}
        <div className="vs-in-r absolute inset-0" style={{ clipPath: `polygon(0 ${SEAM_LEFT}%, 100% ${SEAM_RIGHT}%, 100% 100%, 0 100%)` }}>
          <div className="absolute inset-0" style={{ background: "linear-gradient(340deg, var(--p2) -20%, var(--p2-deep) 40%, #14020a 100%)" }} />
          <div className="vs-img vs-img-bottom right-0" style={{ maskImage: FADE_P2, WebkitMaskImage: FADE_P2 }}>
            <div className="vs-drift-r h-full w-full"><TeamArt team={b} tallSide="right" /></div>
          </div>
        </div>

        {/* Seam — drawn between the same two points the wedges are clipped on,
            so line and photo edges match at any screen shape. */}
        <div className="seam-flash absolute inset-0" aria-hidden="true">
          <svg className="absolute inset-0 h-full w-full" style={{ filter: "drop-shadow(0 0 10px rgba(255,210,63,.95)) drop-shadow(0 0 24px rgba(255,170,40,.7))" }}>
            <line x1="0" y1={`${SEAM_LEFT}%`} x2="100%" y2={`${SEAM_RIGHT}%`} stroke="#fff" strokeWidth="6" />
          </svg>
        </div>

        {/* Names, on each wedge's short side */}
        <div className={`vs-name vs-name-r right-[4%] top-[calc(env(safe-area-inset-top)+5%)] items-end text-right ${duo ? "vs-name-duo" : ""}`} style={nameLen(a)}>
          <p className="font-hud text-[20px] font-bold text-white/80">{duo ? "1P TEAM" : "1P"}</p>
          <TeamNames team={a} tone="p1" />
        </div>
        <div className={`vs-name vs-name-l bottom-[calc(env(safe-area-inset-bottom)+5%)] left-[4%] items-start ${duo ? "vs-name-duo" : ""}`} style={nameLen(b)}>
          <TeamNames team={b} tone="p2" />
          <p className={`font-hud text-[20px] font-bold text-white/80 ${duo ? "mt-3" : "mt-1"}`}>{duo ? "2P TEAM" : "2P"}</p>
        </div>

        {/* VS */}
        <div className="absolute inset-0 flex items-center justify-center [perspective:600px]">
          <span className="shockwave" style={{ animationDelay: ".5s" }} aria-hidden="true" />
          <span className="shockwave" style={{ animationDelay: ".68s", borderColor: "#fff", borderWidth: 4 }} aria-hidden="true" />
          <div className="vs-slam flex flex-col items-center">
            <FxText className="text-[min(30vw,24vh,200px)]" glow="#ffb21f">VS</FxText>
          </div>
        </div>

      </div>

      <div className="white-flash pointer-events-none absolute inset-0 bg-white" style={{ animationDelay: ".45s" }} aria-hidden="true" />
    </div>
  );
}
