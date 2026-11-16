import { useRef, useState } from "react";
import { haptic, sfx } from "../lib/sfx.js";

export const SCORE_MIN = 0;
export const SCORE_MAX = 99;
const TICK_W = 16;
const clamp = (n) => Math.max(SCORE_MIN, Math.min(SCORE_MAX, n));

/** Heavy plus / minus glyph with an ink outline, so it reads at arm's length. */
export function PadGlyph({ plus }) {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden="true">
      <g stroke="#000" strokeWidth="13" strokeLinecap="square">
        <path d="M8 20h24" />{plus && <path d="M20 8v24" />}
      </g>
      <g stroke="#fff" strokeWidth="7" strokeLinecap="square">
        <path d="M8 20h24" />{plus && <path d="M20 8v24" />}
      </g>
    </svg>
  );
}

/** Chunky slanted arcade pad button in the side's color. */
export function PadButton({ label, children, onPress, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className="group relative h-16 w-full disabled:opacity-30 active:scale-[0.94]"
      style={{ transform: "skewX(-12deg)" }}
    >
      <span
        className="absolute inset-0 border-2 border-black transition-[filter] group-active:brightness-150"
        style={{
          background: "linear-gradient(180deg, color-mix(in srgb, var(--tone) 55%, #000) 0%, var(--tone-deep) 52%, #05020c 100%)",
          boxShadow: "0 0 0 2px var(--tone), 0 0 18px -2px var(--tone), inset 0 2px 0 rgba(255,255,255,.28)",
        }}
      />
      <span className="relative flex items-center justify-center" style={{ transform: "skewX(12deg)" }}>
        {children}
      </span>
    </button>
  );
}

/**
 * Drag ruler: drag left/right (or scroll, or arrow keys) and each detent
 * steps the score by 1 with a tick + haptic. A tap left/right of the
 * centre marker nudges one step that way. Ticks scroll past a glowing
 * centre marker; every fifth tick is taller and lit in the side's color.
 *
 * onDragTo(value, first) — `first` is true on the first change of a
 * gesture, so the caller can record one undo step per drag.
 */
export function ScoreRuler({ value, label, onDragTo, disabled }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const dragRef = useRef(null);
  const wheelAcc = useRef(0);

  const commit = (n, first) => {
    const c = clamp(n);
    if (c === valueRef.current) return false;
    valueRef.current = c;
    onDragTo(c, first);
    haptic(8);
    sfx.tick();
    return true;
  };

  const onPointerDown = (e) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startValue: valueRef.current, moved: false, changed: false };
    setDragging(true);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 3) d.moved = true;
    // Dragging the strip left pulls higher numbers under the centre marker.
    const steps = Math.round(-dx / TICK_W);
    if (commit(d.startValue + steps, !d.changed)) d.changed = true;
    setOffset(dx + steps * TICK_W);
  };
  const endDrag = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    setOffset(0);
    if (d && !d.moved) {
      const rect = e.currentTarget.getBoundingClientRect();
      const rel = e.clientX - (rect.left + rect.width / 2);
      if (rel < -12) commit(valueRef.current - 1, true);
      else if (rel > 12) commit(valueRef.current + 1, true);
    }
  };
  const onWheel = (e) => {
    if (disabled) return;
    wheelAcc.current += e.deltaY;
    const steps = Math.trunc(wheelAcc.current / 48);
    if (steps !== 0) {
      wheelAcc.current -= steps * 48;
      commit(valueRef.current - steps, true);
    }
  };
  const onKeyDown = (e) => {
    if (disabled) return;
    const keys = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 };
    if (e.key in keys) { e.preventDefault(); commit(valueRef.current + keys[e.key], true); }
    else if (e.key === "Home") { e.preventDefault(); commit(SCORE_MIN, true); }
    else if (e.key === "End") { e.preventDefault(); commit(SCORE_MAX, true); }
  };

  const fade = "linear-gradient(to right, transparent, #000 20%, #000 80%, transparent)";

  return (
    <div className="relative w-full" style={{ transform: "skewX(-12deg)" }}>
      <div
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={SCORE_MIN}
        aria-valuemax={SCORE_MAX}
        aria-valuenow={value}
        aria-disabled={disabled}
        className="relative h-[58px] w-full cursor-grab touch-none select-none overflow-hidden border-2 border-black outline-none focus-visible:ring-2 focus-visible:ring-[var(--tone)] active:cursor-grabbing"
        style={{
          background: "linear-gradient(180deg, #160c2c 0%, #07030f 100%)",
          boxShadow: "0 0 0 2px rgba(255,255,255,.28), inset 0 3px 10px rgba(0,0,0,.85)",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        <div className="absolute inset-0" style={{ maskImage: fade, WebkitMaskImage: fade }} aria-hidden="true">
          {Array.from({ length: 41 }, (_, i) => i - 20).map((k) => {
            const n = value + k;
            if (n < SCORE_MIN || n > SCORE_MAX) return null;
            const x = k * TICK_W + offset;
            const major = n % 5 === 0;
            return (
              <span
                key={k}
                className="absolute top-1/2 block rounded-full"
                style={{
                  left: `calc(50% + ${x}px)`,
                  width: major ? 3 : 2,
                  height: major ? 32 : 18,
                  transform: "translate(-50%, -50%)",
                  background: major ? "var(--tone)" : "rgba(255,255,255,.55)",
                  boxShadow: major ? "0 0 8px var(--tone)" : "none",
                  opacity: Math.max(0.2, 1 - Math.abs(x / TICK_W) * 0.06),
                  transition: dragging ? "none" : "left 160ms ease-out, opacity 160ms ease-out",
                }}
              />
            );
          })}
        </div>
        {/* Centre marker */}
        <span className="pointer-events-none absolute inset-y-0 left-1/2 w-[4px] -translate-x-1/2 bg-white" style={{ boxShadow: "0 0 10px 2px var(--tone), 0 0 2px #fff" }} aria-hidden="true" />
        <span className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 border-x-[7px] border-t-[8px] border-x-transparent border-t-[var(--tone)]" aria-hidden="true" />
        <span className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 border-x-[7px] border-b-[8px] border-x-transparent border-b-[var(--tone)]" aria-hidden="true" />
      </div>
    </div>
  );
}
