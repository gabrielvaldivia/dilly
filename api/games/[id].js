import { loadState, saveState, sendJson } from '../_state.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'DELETE') return sendJson(res, 405, { error: 'Method not allowed' });
    let id = req.query && req.query.id;
    if (!id) {
      const url = new URL(req.url, 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean);
      id = decodeURIComponent(parts[parts.length - 1] || '');
    }
    if (!id) return sendJson(res, 400, { error: 'Missing game id.' });
    const state = await loadState();
    const before = state.games.length;
    state.games = state.games.filter((g) => g.id !== id);
    if (state.games.length === before) return sendJson(res, 404, { error: 'Game not found.' });
    await saveState(state);
    return sendJson(res, 200, { deleted: id });
  } catch (err) {
    console.error('games DELETE failed', err);
    return sendJson(res, 500, { error: 'Could not delete that game.' });
  }
}
