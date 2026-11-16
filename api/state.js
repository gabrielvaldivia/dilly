import { loadState, saveState, publicState, sendJson, readBody } from './_state.js';

function cleanName(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().replace(/\s+/g, ' ').slice(0, 24);
  return trimmed || fallback;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const state = await loadState();
      return sendJson(res, 200, publicState(state));
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const state = await loadState();
      state.p1Name = cleanName(body.p1Name, state.p1Name);
      state.p2Name = cleanName(body.p2Name, state.p2Name);
      if (state.p1Name.toLowerCase() === state.p2Name.toLowerCase()) {
        return sendJson(res, 400, { error: 'The two names must be different.' });
      }
      await saveState(state);
      return sendJson(res, 200, publicState(state));
    }
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('state handler failed', err);
    return sendJson(res, 500, { error: 'Scoreboard storage is unavailable right now.' });
  }
}
