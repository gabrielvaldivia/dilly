import { randomUUID } from 'node:crypto';
import { loadState, saveState, sendJson, readBody } from './_state.js';

function validScore(v) {
  return Number.isInteger(v) && v >= 0 && v <= 99;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const body = await readBody(req);
    const { p1Score, p2Score } = body || {};
    if (!validScore(p1Score) || !validScore(p2Score)) {
      return sendJson(res, 400, { error: 'Scores must be whole numbers from 0 to 99.' });
    }
    if (p1Score === p2Score) {
      return sendJson(res, 400, { error: 'A pickleball game needs a winner. Scores cannot be tied.' });
    }
    let createdAt = new Date().toISOString();
    if (typeof body.createdAt === 'string') {
      const parsed = new Date(body.createdAt);
      if (!Number.isNaN(parsed.getTime())) createdAt = parsed.toISOString();
    }
    const game = { id: randomUUID(), createdAt, p1Score, p2Score };
    const state = await loadState();
    state.games.push(game);
    state.games.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    await saveState(state);
    return sendJson(res, 201, { game });
  } catch (err) {
    console.error('games POST failed', err);
    return sendJson(res, 500, { error: 'Could not save that game.' });
  }
}
