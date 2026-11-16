import { useEffect, useMemo, useRef } from "react";
import { useCardTexture } from "../lib/cardTexture.js";

const RAD = Math.PI / 180;
const MERIDIANS = Array.from({ length: 9 }, (_, i) => i * 20);
const PARALLELS = [-60, -30, 0, 30, 60];
const GAP = 0.06; // space between cards, as arc length / radius

/** Facet grid per card: lighter on phones, smoother on bigger screens. */
function facetGrid() {
  const small = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  return small ? { cols: 4, rows: 3 } : { cols: 5, rows: 4 };
}

/**
 * Lay n tiles on the front cap of a sphere. Rows near the equator hold
 * more tiles (like a globe), tile spacing stays even along each row, and
 * everything is relative to the radius so CSS can size it.
 */
/** Largest card size (arc / radius). Desktop globes are big, so cards stay smaller there. */
function maxCardArc() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches ? 0.36 : 0.5;
}

function layoutCap(n, maxTw = 0.5) {
  const rows = n <= 3 ? 1 : n <= 8 ? 2 : n <= 15 ? 3 : n <= 24 ? 4 : n <= 35 ? 5 : 6;
  const prov = Array.from({ length: rows }, (_, i) => (i - (rows - 1) / 2) * 24);
  const weights = prov.map((l) => Math.cos(l * RAD));
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (n * w) / sum);
  const counts = raw.map(Math.floor);
  const order = raw
    .map((r, i) => ({ i, rem: r - Math.floor(r), mid: -Math.abs(i - (rows - 1) / 2) }))
    .sort((a, b) => b.rem - a.rem || b.mid - a.mid);
  for (let k = 0; k < n - counts.reduce((a, b) => a + b, 0); k++) counts[order[k].i]++;

  // One gap, measured along the sphere, between neighbours in a row and
  // between rows. Tile width (arc, as a fraction of R) is the largest that
  // fits the widest row inside ~128° and all rows inside ~120°.
  const maxCount = Math.max(...counts);
  const span = 128 * RAD;
  const vspan = 120 * RAD;
  const tw = Math.min(maxTw, (span - (maxCount - 1) * GAP) / maxCount, (vspan - (rows - 1) * GAP) / (rows * 1.25));
  const latStep = (tw * 1.25 + GAP) / RAD;
  const tiles = [];
  counts.forEach((c, r) => {
    const lat = ((rows - 1) / 2 - r) * latStep;
    const lonStep = (tw + GAP) / RAD / Math.cos(lat * RAD);
    for (let j = 0; j < c; j++) tiles.push({ lat, lon: (j - (c - 1) / 2) * lonStep });
  });
  return { tiles, tw };
}

/**
 * Facet positions for one card wrapped onto the sphere. The card is a
 * lat/lon patch: rows share column longitudes (slices line up), and each
 * row is squeezed by cos(lat) so neighbouring facets meet edge to edge.
 */
function facetsFor(tile, tw, cols, rows) {
  const angW = tw / RAD;
  const angH = (tw * 1.25) / RAD;
  const cosMid = Math.cos(tile.lat * RAD);
  const out = [];
  for (let i = 0; i < rows; i++) {
    const lat = tile.lat + (0.5 - (i + 0.5) / rows) * angH;
    const sx = (Math.cos(lat * RAD) / cosMid).toFixed(4);
    for (let j = 0; j < cols; j++) {
      out.push({
        key: i * cols + j,
        top: i === 0,
        left: j === 0,
        right: j === cols - 1,
        style: {
          "--lat": `${lat.toFixed(3)}deg`,
          "--lon": `${(tile.lon + (((j + 0.5) / cols - 0.5) * angW) / cosMid).toFixed(3)}deg`,
          "--sx": sx,
          backgroundPosition: `${cols > 1 ? (j / (cols - 1)) * 100 : 0}% ${rows > 1 ? (i / (rows - 1)) * 100 : 0}%`,
        },
      });
    }
  }
  return out;
}

/** One card on the globe: a zero-size button whose facets carry slices of a baked texture. */
function Card({ player, variant, tile, tw, grid, label, pressed, onClick, side }) {
  const url = useCardTexture(player, variant);
  const facets = useMemo(() => facetsFor(tile, tw, grid.cols, grid.rows), [tile, tw, grid]);
  const bg = url ? `url(${url})` : undefined;
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} aria-label={label} className={`gtile ${side ? `tone-${side}` : ""}`}>
      {facets.map((f) => (
        <span key={f.key} className="gfacet" style={{ ...f.style, backgroundImage: bg }}>
          {side && f.top && (side === "p1" ? f.left : f.right) && (
            <span className="cursor-tag" style={side === "p1" ? { left: -3 } : { right: -3 }}>{side === "p1" ? "1P" : "2P"}</span>
          )}
        </span>
      ))}
    </button>
  );
}

/** Both 3D layers share the same rig so they move as one globe. */
function Rig({ children, style }) {
  return (
    <div className="globe-layer">
      <div className="globe-3d globe-intro">
        <div className="globe-3d globe-sway">
          <div className="globe-3d globe-rot" style={style}>{children}</div>
        </div>
      </div>
    </div>
  );
}

const DEG_PER_PX = 0.4; // drag sensitivity
const FRICTION = 0.94; // momentum kept per 60fps frame
const SETTLE_DELAY = 1100; // ms the globe rests where it stopped before returning
const SETTLE_MS = 900;
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

/**
 * The roster as a 3D globe. The wireframe and the cards are separate 3D
 * layers so the browser never has to depth-sort ring planes against card
 * facets. Drag in any direction to spin it freely on both axes (with
 * momentum); once it comes to rest it eases back to the nearest
 * front-facing turn so the cards are reachable. A drag never counts as a tap.
 */
export function Globe({ players, sel, onPick, onAdd }) {
  const stageRef = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const rot = useRef({ yaw: 0, pitch: 0, vy: 0, vp: 0, raf: 0, timer: 0 });
  const grid = useMemo(facetGrid, []);
  const { tiles, tw } = useMemo(() => layoutCap(players.length + 1, maxCardArc()), [players.length]);

  useEffect(() => () => { cancelAnimationFrame(rot.current.raf); window.clearTimeout(rot.current.timer); }, []);

  const apply = () => {
    const { yaw, pitch } = rot.current;
    stageRef.current?.querySelectorAll(".globe-rot").forEach((el) => {
      el.style.setProperty("--yaw", `${yaw.toFixed(2)}deg`);
      el.style.setProperty("--pitch", `${pitch.toFixed(2)}deg`);
    });
  };
  const halt = () => {
    const r = rot.current;
    cancelAnimationFrame(r.raf);
    window.clearTimeout(r.timer);
    r.raf = 0;
  };

  /** Ease to the nearest whole turn on both axes (i.e. facing front). */
  const settle = () => {
    const r = rot.current;
    const fromY = r.yaw, fromP = r.pitch;
    const toY = Math.round(fromY / 360) * 360, toP = Math.round(fromP / 360) * 360;
    if (Math.abs(fromY - toY) < 0.1 && Math.abs(fromP - toP) < 0.1) { r.yaw = 0; r.pitch = 0; apply(); return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    const step = (now) => {
      const t = reduce ? 1 : Math.min(1, (now - t0) / SETTLE_MS);
      const e = easeOutBack(t);
      r.yaw = fromY + (toY - fromY) * e;
      r.pitch = fromP + (toP - fromP) * e;
      if (t < 1) { apply(); r.raf = requestAnimationFrame(step); }
      else { r.yaw = 0; r.pitch = 0; apply(); r.raf = 0; }
    };
    r.raf = requestAnimationFrame(step);
  };
  const settleSoon = () => {
    window.clearTimeout(rot.current.timer);
    rot.current.timer = window.setTimeout(settle, SETTLE_DELAY);
  };

  /** Let a flick keep spinning, slowing with friction, then rest and return. */
  const coast = () => {
    const r = rot.current;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(32, now - last);
      last = now;
      r.yaw += r.vy * dt;
      r.pitch += r.vp * dt;
      const f = Math.pow(FRICTION, dt / 16.7);
      r.vy *= f;
      r.vp *= f;
      apply();
      if (Math.hypot(r.vy, r.vp) > 0.01) r.raf = requestAnimationFrame(step);
      else { r.raf = 0; settleSoon(); }
    };
    r.raf = requestAnimationFrame(step);
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    halt(); // catch a spinning or returning globe
    const r = rot.current;
    drag.current = { x: e.clientX, y: e.clientY, yaw: r.yaw, pitch: r.pitch, moved: false, samples: [] };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 8) return;
      d.moved = true;
      try { e.target.setPointerCapture(e.pointerId); } catch { /* already released */ }
    }
    const r = rot.current;
    r.yaw = d.yaw + dx * DEG_PER_PX;
    r.pitch = d.pitch - dy * DEG_PER_PX;
    const now = performance.now();
    d.samples.push({ t: now, yaw: r.yaw, pitch: r.pitch });
    while (d.samples.length > 2 && now - d.samples[0].t > 90) d.samples.shift();
    apply();
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const r = rot.current;
    if (!d.moved) {
      // A tap: if it interrupted a spin or return, finish returning.
      if (r.yaw % 360 !== 0 || r.pitch % 360 !== 0) settleSoon();
      return;
    }
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    const a = d.samples[0], b = d.samples[d.samples.length - 1];
    const dt = b && a ? b.t - a.t : 0;
    const cap = (v) => Math.max(-2, Math.min(2, v));
    r.vy = dt > 0 ? cap((b.yaw - a.yaw) / dt) : 0;
    r.vp = dt > 0 ? cap((b.pitch - a.pitch) / dt) : 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { r.vy = 0; r.vp = 0; }
    coast();
  };

  return (
    <div className="globe-wrap">
      <div
        ref={stageRef}
        className="globe-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => { if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); } }}
      >
        <div className="globe-hit" aria-hidden="true" />
        <div className="globe-core" aria-hidden="true" />
        <div className="globe-base" aria-hidden="true" />

        <Rig>
          <div className="globe-3d globe-wire" aria-hidden="true">
            {MERIDIANS.map((a) => <span key={`m${a}`} className="g-ring g-merid" style={{ "--a": `${a}deg` }} />)}
            {PARALLELS.map((l) => (
              <span key={`p${l}`} className={`g-ring g-par ${l === 0 ? "g-equator" : ""}`} style={{ "--c": Math.cos(l * RAD).toFixed(4), "--s": Math.sin(l * RAD).toFixed(4) }} />
            ))}
          </div>
        </Rig>

        <Rig style={{ "--tw": tw, "--cols": grid.cols, "--rows": grid.rows }}>
          {players.map((p, i) => {
            const side = sel.p1 === p.id ? "p1" : sel.p2 === p.id ? "p2" : null;
            return (
              <Card
                key={p.id}
                player={p}
                variant={side ?? "idle"}
                side={side}
                tile={tiles[i]}
                tw={tw}
                grid={grid}
                label={`${p.name}${side === "p1" ? ", player 1" : side === "p2" ? ", player 2" : ""}`}
                pressed={Boolean(side)}
                onClick={() => onPick(p.id)}
              />
            );
          })}
          <Card player={null} variant="add" tile={tiles[players.length]} tw={tw} grid={grid} label="Add a new fighter" onClick={onAdd} />
        </Rig>
      </div>
    </div>
  );
}
