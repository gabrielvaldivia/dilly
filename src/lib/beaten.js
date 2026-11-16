import { apiFetch } from "./api.js";

/* ------------------------------------------------------------------ */
/* The beaten-up "defeated" portrait for the win screen is generated   */
/* on the server, normally in the background right after a fighter is  */
/* saved. If it isn't ready when the win screen needs it, ask once and */
/* — while the server reports it's still being made — check back every */
/* few seconds rather than starting a second generation.               */
/* ------------------------------------------------------------------ */

const POLL_MS = 8000;
const MAX_POLLS = 16; // ~2 minutes
const inflight = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function hasBeaten(player) {
  return Boolean(player?.photo && player.beaten === player.photo);
}

async function request(id) {
  for (let i = 0; i < MAX_POLLS; i++) {
    const r = await apiFetch(`/api/beaten/${encodeURIComponent(id)}`, { method: "POST" });
    if (hasBeaten(r.player)) return r.player;
    if (!r.pending) return null;
    await sleep(POLL_MS);
  }
  return null;
}

/** Resolve to the fighter with their defeated portrait ready, or null if it can't be made. */
export function ensureBeaten(player) {
  if (!player?.photo) return Promise.resolve(null);
  if (hasBeaten(player)) return Promise.resolve(player);
  const key = `${player.id}:${player.photo}`;
  if (!inflight.has(key)) {
    inflight.set(key, request(player.id).catch(() => null).then((p) => {
      if (!p) inflight.delete(key);
      return p;
    }));
  }
  return inflight.get(key);
}
