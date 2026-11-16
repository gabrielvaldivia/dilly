import { randomUUID } from 'node:crypto';
import { loadState, saveState, sendJson, readBody, route, HttpError } from './_state.js';

function validScore(v) {
  return Number.isInteger(v) && v >= 0 && v <= 99;
}

export default route(
  {
    async POST(req, res) {
      const body = (await readBody(req)) || {};
      const { p1Id, p2Id, p1Score, p2Score } = body;
      if (typeof p1Id !== 'string' || typeof p2Id !== 'string' || !p1Id || !p2Id) {
        throw new HttpError(400, 'Pick two fighters first.');
      }
      if (p1Id === p2Id) throw new HttpError(400, 'A fighter cannot play themselves.');
      if (!validScore(p1Score) || !validScore(p2Score)) {
        throw new HttpError(400, 'Scores must be whole numbers from 0 to 99.');
      }
      if (p1Score === p2Score) throw new HttpError(400, 'A pickleball game needs a winner. Scores cannot be tied.');

      const state = await loadState();
      const ids = new Set(state.players.map((p) => p.id));
      if (!ids.has(p1Id) || !ids.has(p2Id)) throw new HttpError(404, 'One of those fighters no longer exists.');

      let createdAt = new Date().toISOString();
      if (typeof body.createdAt === 'string') {
        const parsed = new Date(body.createdAt);
        if (!Number.isNaN(parsed.getTime())) createdAt = parsed.toISOString();
      }
      const game = { id: randomUUID(), createdAt, p1Id, p2Id, p1Score, p2Score };
      state.games.push(game);
      state.games.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      await saveState(state);
      return sendJson(res, 201, { game });
    },
  },
  'Could not save that game.'
);
