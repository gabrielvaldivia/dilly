import { loadState, saveState, sendJson, route, routeId, HttpError } from '../_state.js';

export default route(
  {
    async DELETE(req, res) {
      const id = routeId(req);
      if (!id) throw new HttpError(400, 'Missing game id.');
      const state = await loadState();
      const before = state.games.length;
      state.games = state.games.filter((g) => g.id !== id);
      if (state.games.length === before) throw new HttpError(404, 'Game not found.');
      await saveState(state);
      return sendJson(res, 200, { deleted: id });
    },
  },
  'Could not delete that game.'
);
