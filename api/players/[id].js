import {
  loadState, saveState, sendJson, readBody, route, routeId, HttpError,
  cleanName, decodePhoto, savePhoto, deletePhoto,
} from '../_state.js';
import { generateBeatenInBackground } from '../_beaten.js';

export default route(
  {
    async PATCH(req, res) {
      const id = routeId(req);
      const body = (await readBody(req)) || {};
      const photoBytes = body.photo ? decodePhoto(body.photo) : null;

      const state = await loadState();
      const player = state.players.find((p) => p.id === id);
      if (!player) throw new HttpError(404, 'Fighter not found.');

      if (body.name !== undefined) {
        const name = cleanName(body.name);
        if (!name) throw new HttpError(400, 'Every fighter needs a name.');
        const taken = state.players.find((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase());
        if (taken) throw new HttpError(409, `${taken.name} is already on the roster.`);
        player.name = name;
      }

      const oldPhoto = player.photo;
      if (photoBytes) player.photo = await savePhoto(id, photoBytes);
      await saveState(state);
      if (photoBytes) {
        await deletePhoto(id, oldPhoto);
        // New photo → new beaten-up win-screen portrait, made after we've replied.
        generateBeatenInBackground(id);
      }
      return sendJson(res, 200, { player });
    },

    async DELETE(req, res) {
      const id = routeId(req);
      const state = await loadState();
      const player = state.players.find((p) => p.id === id);
      if (!player) throw new HttpError(404, 'Fighter not found.');
      const before = state.games.length;
      state.games = state.games.filter((g) => g.p1Id !== id && g.p2Id !== id);
      state.players = state.players.filter((p) => p.id !== id);
      await saveState(state);
      await deletePhoto(id, player.photo);
      return sendJson(res, 200, { deleted: id, gamesRemoved: before - state.games.length });
    },
  },
  'Could not update that fighter.'
);
