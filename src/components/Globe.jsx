import { useEffect, useMemo, useRef } from "react";
import { useCardTexture } from "../lib/cardTexture.js";
import { useSpine } from "../lib/spine.js";

const RAD = Math.PI / 180;
const GAP = 0.06; // gutter between cards (arc / radius); the grid lines run down its middle
const ASPECT = 1.25; // card height / width
const POLE = 78 * RAD; // no parallels past this: they would be tiny rings

/** Strips per card: lighter on phones, smoother on bigger screens. */
function facetGrid() {
  const small = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  return { cols: small ? 4 : 5 };
}

/** Largest card size (arc / radius). Desktop globes are big, so cards stay smaller there. */
function maxCardArc() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches ? 0.3 : 0.42;
}

/**
 * Height (rad) of the grid band whose equator-side edge is at latitude
 * `from`: the cell at its centre has the card's 4:5 shape, so bands get
 * shorter toward the poles as the meridians close in.
 */
function bandHeight(from, dLon) {
  const cell = (c) => ASPECT * (Math.cos(c) * dLon - GAP) + GAP;
  let h = cell(from);
  for (let i = 0; i < 8; i++) h = cell(from + h / 2);
  return h;
}

/** Bands stacked poleward from latitude `from`, stopping short of POLE: [{ c, h }] in rad. */
function bandsFrom(from, dLon) {
  const out = [];
  for (let h = bandHeight(from, dLon); h > 2 * GAP && from + h <= POLE; h = bandHeight(from, dLon)) {
    out.push({ c: from + h / 2, h });
    from += h;
  }
  return out;
}

/**
 * The globe's grid and the card slots on it, built from one cell size so
 * every card fills a cell and the lines run through the gutters. Meridians
 * are evenly spaced (360°/k, k even so each ring is a full great circle);
 * parallels are spaced so every cell keeps the card's shape. Rows share
 * columns; a short row (outer rows first) leaves its last cell open.
 * Everything is relative to the radius so CSS can size it.
 * `split`: a foldable's spine runs down the middle of the screen, so with
 * an odd number of columns the block shifts half a column to put a gutter,
 * not a card, on the spine.
 */
function layoutGlobe(n, maxTw = 0.5, split = false) {
  const rows = n <= 3 ? 1 : n <= 8 ? 2 : n <= 15 ? 3 : n <= 24 ? 4 : n <= 35 ? 5 : 6;
  const cols = Math.ceil(n / rows);
  const odd = rows % 2 === 1;
  const half = Math.floor(rows / 2); // card rows above the equator (or above the centre row)

  // The card width that fits the block inside ~128° x 120° of the front,
  // snapped down to an even number of meridians around the globe.
  const tw0 = Math.min(maxTw, (128 * RAD - (cols - 1) * GAP) / cols, (120 * RAD - (rows - 1) * GAP) / (rows * ASPECT));
  const latRef = odd ? 0 : (ASPECT * tw0 + GAP) / 2;
  let k = 2 * Math.max(2, Math.ceil((Math.PI * Math.cos(latRef)) / (tw0 + GAP)));
  let dLon, h0, north;
  for (;;) {
    dLon = (2 * Math.PI) / k;
    h0 = odd ? ASPECT * (dLon - GAP) + GAP : 0; // the centre row straddles the equator
    north = bandsFrom(h0 / 2, dLon);
    const top = h0 / 2 + north.slice(0, half).reduce((s, b) => s + b.h, 0);
    if ((north.length >= half && cols * dLon <= 130 * RAD && 2 * top <= 130 * RAD) || k >= 72) break;
    k += 2; // too big for the front: one size smaller
  }

  const bands = [
    ...north.slice(0, half).reverse(),
    ...(odd ? [{ c: 0, h: h0 }] : []),
    ...north.slice(0, half).map((b) => ({ c: -b.c, h: b.h })),
  ];
  const counts = bands.map(() => cols);
  const order = [];
  for (let i = 0; i < Math.ceil(rows / 2); i++) { order.push(rows - 1 - i); if (i !== rows - 1 - i) order.push(i); }
  for (let e = 0; e < rows * cols - n; e++) counts[order[e]]--;

  const shift = split && cols % 2 ? dLon / 2 : 0;
  const tiles = [];
  bands.forEach((b, r) => {
    const tw = Math.cos(b.c) * dLon - GAP; // card width at its centre row
    const first = Math.floor((cols - counts[r]) / 2);
    for (let j = 0; j < counts[r]; j++) {
      tiles.push({ lat: b.c / RAD, lon: ((first + j - (cols - 1) / 2) * dLon + shift) / RAD, tw, th: b.h - GAP });
    }
  });

  const step = dLon / RAD;
  const offset = cols % 2 && !shift ? step / 2 : 0; // a line between every pair of columns
  const meridians = Array.from({ length: k / 2 }, (_, i) => offset + i * step);
  const tops = [...(odd ? [h0 / 2] : []), ...north.map((b) => b.c + b.h / 2)].map((l) => l / RAD);
  const parallels = [...(odd ? [] : [0]), ...tops.flatMap((l) => [l, -l])];
  return { tiles, meridians, parallels };
}

/**
 * One card wrapped onto the sphere as full-height vertical strips, each
 * tangent to the globe at the card's centre latitude. The card bends only
 * left to right (around the globe's axis), so the picture stays a true
 * rectangle: no rows to step apart, no row-by-row squeeze. Strip widths
 * form the tangent polygon of that latitude's circle, so neighbours meet.
 */
function facetsFor(tile, cols) {
  const cosC = Math.cos(tile.lat * RAD);
  const dLon = tile.tw / cosC / cols; // longitude per strip (rad)
  const sw = 2 * cosC * Math.tan(dLon / 2); // strip width (fraction of R)
  const facets = Array.from({ length: cols }, (_, j) => ({
    key: j,
    left: j === 0,
    right: j === cols - 1,
    style: {
      "--lon": `${(tile.lon + ((j + 0.5 - cols / 2) * dLon) / RAD).toFixed(3)}deg`,
      "--j": j,
      ...(j === cols - 1 ? { "--o": "0px" } : null), // the last strip has no neighbour to overlap
    },
  }));
  return { facets, vars: { "--lat": `${tile.lat.toFixed(3)}deg`, "--sw": sw.toFixed(5), "--sh": tile.th.toFixed(5) } };
}

/** One card on the globe: a zero-size button whose facets carry slices of a baked texture. */
function Card({ player, variant, tile, grid, label, pressed, onClick, side }) {
  const url = useCardTexture(player, variant);
  const { facets, vars } = useMemo(() => facetsFor(tile, grid.cols), [tile, grid]);
  const bg = url ? `url(${url})` : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      className={`gtile ${side ? `tone-${side}` : ""}`}
      style={vars}
    >
      {facets.map((f) => (
        <span key={f.key} className="gfacet" style={{ ...f.style, backgroundImage: bg }}>
          {side && (side === "p1" ? f.left : f.right) && (
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

/*
 * 1:1 grab: the card under the finger stays under the finger. Cards sit on
 * the sphere (R) and the layer's perspective (2.4D = 4.8R) magnifies the
 * front by 4.8 / (4.8 - 1), so turning the globe by θ radians moves its
 * front FRONT_PX_PER_RAD × R pixels on screen.
 */
const FRONT_PX_PER_RAD = 4.8 / (4.8 - 1);
const degPerPx = (el) => (180 / Math.PI) / (FRONT_PX_PER_RAD * (el.getBoundingClientRect().width / 2));
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
 * `picks` maps each picked fighter's id to their side ("p1" | "p2").
 */
export function Globe({ players, picks, onPick, onAdd }) {
  const stageRef = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const rot = useRef({ yaw: 0, pitch: 0, vy: 0, vp: 0, raf: 0, timer: 0 });
  const grid = useMemo(facetGrid, []);
  const split = useSpine() === "v";
  const { tiles, meridians, parallels } = useMemo(() => layoutGlobe(players.length + 1, maxCardArc(), split), [players.length, split]);

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
    drag.current = { x: e.clientX, y: e.clientY, yaw: r.yaw, pitch: r.pitch, k: degPerPx(e.currentTarget), moved: false, samples: [] };
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
    r.yaw = d.yaw + dx * d.k;
    r.pitch = d.pitch - dy * d.k;
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
          <div className="globe-3d" aria-hidden="true">
            {/* A ring turned by a passes through longitudes a ± 90°. */}
            {meridians.map((lon, i) => <span key={`m${i}`} className="g-ring g-merid" style={{ "--a": `${(lon - 90).toFixed(3)}deg` }} />)}
            {parallels.map((l, i) => (
              <span key={`p${i}`} className={`g-ring g-par ${l === 0 ? "g-equator" : ""}`} style={{ "--c": Math.cos(l * RAD).toFixed(4), "--s": Math.sin(l * RAD).toFixed(4) }} />
            ))}
          </div>
        </Rig>

        <Rig style={{ "--cols": grid.cols }}>
          {players.map((p, i) => {
            const side = picks.get(p.id) ?? null;
            return (
              <Card
                key={p.id}
                player={p}
                variant={side ?? "idle"}
                side={side}
                tile={tiles[i]}
                grid={grid}
                label={`${p.name}${side === "p1" ? ", player 1" : side === "p2" ? ", player 2" : ""}`}
                pressed={Boolean(side)}
                onClick={() => onPick(p.id)}
              />
            );
          })}
          <Card player={null} variant="add" tile={tiles[players.length]} grid={grid} label="Add a new fighter" onClick={onAdd} />
        </Rig>
      </div>
    </div>
  );
}
