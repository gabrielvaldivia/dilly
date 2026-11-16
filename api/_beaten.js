import { waitUntil } from '@vercel/functions';
import { loadState, saveState, loadPhoto, saveBeaten, HttpError } from './_state.js';
import { editImage } from './_openai.js';
import { BEATEN_PROMPT } from './_stylePrompt.js';

/* ------------------------------------------------------------------ */
/* The beaten-up "defeated" portrait for the win screen, made once per */
/* fighter photo. A start timestamp (beatenPending) is stored while it */
/* generates so concurrent requests wait instead of paying twice; it   */
/* expires so a crashed job can be retried.                            */
/* ------------------------------------------------------------------ */

const PENDING_MS = 150_000;

/** Generate (or report on) a fighter's defeated portrait. status: 'ready' | 'pending'. */
export async function generateBeaten(id) {
  let state = await loadState();
  let player = state.players.find((p) => p.id === id);
  if (!player) throw new HttpError(404, 'Fighter not found.');
  if (!Number.isInteger(player.photo)) throw new HttpError(400, 'This fighter has no photo yet.');
  if (player.beaten === player.photo) return { player, status: 'ready' };
  if (player.beatenPending && Date.now() - player.beatenPending < PENDING_MS) return { player, status: 'pending' };

  const version = player.photo;
  player.beatenPending = Date.now();
  await saveState(state);

  let made = false;
  try {
    const photo = await loadPhoto(id, version);
    if (!photo) throw new HttpError(404, 'Photo not found.');
    const beaten = await editImage(photo, BEATEN_PROMPT);
    await saveBeaten(id, version, beaten);
    made = true;
  } finally {
    // Generation takes ~30s: re-read state so nothing saved meanwhile is lost.
    state = await loadState();
    player = state.players.find((p) => p.id === id);
    if (player) {
      if (made && player.photo === version) player.beaten = version;
      player.beatenPending = null;
      await saveState(state);
    }
  }
  return { player, status: 'ready' };
}

/**
 * Kick off generation after a fighter is saved, without holding up the
 * response. waitUntil keeps the serverless function alive until it's done
 * (locally the dev server simply lets the promise finish).
 */
export function generateBeatenInBackground(id) {
  if (!process.env.OPENAI_API_KEY) return;
  waitUntil(
    generateBeaten(id).catch((err) => console.error('background defeated portrait failed', err?.message || err))
  );
}
