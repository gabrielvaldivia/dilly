import { randomUUID } from 'node:crypto';
import {
  loadState, saveState, sendJson, readBody, route, HttpError,
  cleanName, decodePhoto, savePhoto, ROSTER_MAX,
} from './_state.js';

export default route(
  {
    async POST(req, res) {
      const body = (await readBody(req)) || {};
      const name = cleanName(body.name);
      if (!name) throw new HttpError(400, 'Every fighter needs a name.');
      const photoBytes = body.photo ? decodePhoto(body.photo) : null;

      const state = await loadState();
      if (state.players.length >= ROSTER_MAX) throw new HttpError(400, 'The roster is full.');
      const taken = state.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (taken) throw new HttpError(409, `${taken.name} is already on the roster.`);

      const id = randomUUID();
      const photo = photoBytes ? await savePhoto(id, photoBytes) : null;
      const player = { id, name, createdAt: new Date().toISOString(), photo };
      state.players.push(player);
      await saveState(state);
      return sendJson(res, 201, { player });
    },
  },
  'Could not add that fighter.'
);
