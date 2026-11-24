import { randomUUID } from 'node:crypto';
import { loadState, saveState, sendJson, readBody, route, HttpError, validScore, validTeams } from './_state.js';

/*
 * POST /api/games
 *   singles: { p1Id, p2Id, p1Score, p2Score }
 *   doubles: { p1Ids: [a, b], p2Ids: [c, d], p1Score, p2Score }
 */
export default route(
  {
    async POST(req, res) {
      const body = (await readBody(req)) || {};
      const { p1Score, p2Score } = body;
      const doubles = body.p1Ids !== undefined || body.p2Ids !== undefined;

      let fighters;
      if (doubles) {
        if (!validTeams(body.p1Ids, body.p2Ids)) throw new HttpError(400, 'Doubles needs two teams of two different fighters.');
        fighters = [...body.p1Ids, ...body.p2Ids];
      } else {
        const { p1Id, p2Id } = body;
        if (typeof p1Id !== 'string' || typeof p2Id !== 'string' || !p1Id || !p2Id) {
          throw new HttpError(400, 'Pick two fighters first.');
        }
        if (p1Id === p2Id) throw new HttpError(400, 'A fighter cannot play themselves.');
        fighters = [p1Id, p2Id];
      }
      if (!validScore(p1Score) || !validScore(p2Score)) {
        throw new HttpError(400, 'Scores must be whole numbers from 0 to 99.');
      }
      if (p1Score === p2Score) throw new HttpError(400, 'A pickleball game needs a winner. Scores cannot be tied.');

      const state = await loadState();
      const ids = new Set(state.players.map((p) => p.id));
      if (!fighters.every((id) => ids.has(id))) throw new HttpError(404, 'One of those fighters no longer exists.');

      let createdAt = new Date().toISOString();
      if (typeof body.createdAt === 'string') {
        const parsed = new Date(body.createdAt);
        if (!Number.isNaN(parsed.getTime())) createdAt = parsed.toISOString();
      }
      const byDate = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);
      let game;
      if (doubles) {
        game = { id: randomUUID(), createdAt, p1Ids: [...body.p1Ids], p2Ids: [...body.p2Ids], p1Score, p2Score };
        state.doubles.push(game);
        state.doubles.sort(byDate);
      } else {
        game = { id: randomUUID(), createdAt, p1Id: body.p1Id, p2Id: body.p2Id, p1Score, p2Score };
        state.games.push(game);
        state.games.sort(byDate);
      }
      await saveState(state);
      return sendJson(res, 201, { game });
    },
  },
  'Could not save that game.'
);
