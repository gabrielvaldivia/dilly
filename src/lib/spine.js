import { useSyncExternalStore } from "react";

/* ------------------------------------------------------------------ */
/* Foldables. The iPhone Duo opens on a spine across the middle of its  */
/* inner screen, and a control sitting on it is hard to see and to tap. */
/* This works out whether the page spans a spine and marks <html> with  */
/*   spine-v  — a vertical spine: the phone held open like a book;     */
/*   spine-h  — a horizontal spine: the open phone turned upright;     */
/* and sets --spine-w, the band layouts keep clear around it. Layouts   */
/* assume the spine runs through the middle of the viewport, as it does */
/* on book-style foldables, so a symmetric split lines up with it.      */
/* ------------------------------------------------------------------ */

const BAND = 32; // px kept clear around the spine
const CENTERED = 8; // how far off the middle a reported fold may be and still count

// The iPhone Duo's inner screen, open, in CSS px (points).
const DUO_SHORT = 669;
const DUO_LONG = 951;
const NEAR = 4;

/**
 * Where the browser says the fold is (the Viewport Segments API: in
 * Chrome on Android foldables, and in Safari behind a feature flag).
 */
function fromSegments() {
  const segs = window.viewport?.segments;
  if (!segs || segs.length !== 2) return null;
  const [a, b] = segs;
  const sideBySide = Math.abs(a.top - b.top) < 1;
  const start = sideBySide ? a.right : a.bottom;
  const end = sideBySide ? b.left : b.top;
  const middle = (sideBySide ? window.innerWidth : window.innerHeight) / 2;
  if (Math.abs((start + end) / 2 - middle) > CENTERED) return null;
  return { axis: sideBySide ? "v" : "h", band: Math.max(BAND, Math.ceil(end - start) + 16) };
}

/**
 * Safari doesn't report the fold by default, so recognise the iPhone
 * Duo's open inner screen by its size. Landscape: the spine runs down
 * the middle. Portrait: across the middle, but only when the page has
 * the whole screen (a Home Screen web app), so the middle is the spine.
 */
function fromScreenSize() {
  if (!window.matchMedia("(pointer: coarse)").matches) return null;
  const [short, long] = [window.screen.width, window.screen.height].sort((x, y) => x - y);
  if (Math.abs(short - DUO_SHORT) > NEAR || Math.abs(long - DUO_LONG) > NEAR) return null;
  const w = window.innerWidth, h = window.innerHeight;
  if (w > h) return Math.abs(w - long) <= NEAR ? { axis: "v", band: BAND } : null;
  return Math.abs(h - long) <= NEAR ? { axis: "h", band: BAND } : null;
}

let axis = null; // "v" | "h" | null
const listeners = new Set();

function update() {
  const found = fromSegments() ?? fromScreenSize();
  const root = document.documentElement;
  root.classList.toggle("spine-v", found?.axis === "v");
  root.classList.toggle("spine-h", found?.axis === "h");
  if (found) root.style.setProperty("--spine-w", `${found.band}px`);
  else root.style.removeProperty("--spine-w");
  const next = found?.axis ?? null;
  if (next !== axis) {
    axis = next;
    listeners.forEach((fn) => fn());
  }
}

/** Start tracking the spine (folding, unfolding and turning the phone). Call once, before the first render. */
export function watchSpine() {
  update();
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
}

/** The current spine: "v", "h" or null. Re-renders when it changes. */
export function useSpine() {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    () => axis,
    () => null
  );
}
