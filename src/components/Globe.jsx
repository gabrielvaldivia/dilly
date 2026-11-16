import { useMemo, useRef } from "react";
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
function layoutCap(n) {
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
  const tw = Math.min(0.5, (span - (maxCount - 1) * GAP) / maxCount, (vspan - (rows - 1) * GAP) / (rows * 1.25));
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

/**
 * The roster as a 3D globe. The wireframe and the cards are separate 3D
 * layers so the browser never has to depth-sort ring planes against card
 * facets. Drag sideways to spin (springs back); a drag never counts as a tap.
 */
export function Globe({ players, sel, onPick, onAdd }) {
  const stageRef = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const grid = useMemo(facetGrid, []);
  const { tiles, tw } = useMemo(() => layoutCap(players.length + 1), [players.length]);

  const setYaw = (deg) => {
    stageRef.current?.querySelectorAll(".globe-rot").forEach((el) => el.style.setProperty("--yaw", `${deg}deg`));
  };
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, moved: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < 8) return;
      d.moved = true;
      stageRef.current?.classList.add("is-dragging");
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* already released */ }
    }
    setYaw(Math.max(-70, Math.min(70, dx * 0.4)));
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    stageRef.current?.classList.remove("is-dragging");
    setYaw(0);
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
