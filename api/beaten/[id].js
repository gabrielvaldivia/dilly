import { sendJson, route, routeId, HttpError } from '../_state.js';
import { requireImageKey } from '../_openai.js';
import { generateBeaten } from '../_beaten.js';

// POST /api/beaten/:playerId → { player, pending }
// Makes sure the fighter's defeated portrait exists for their current
// photo. 200 once it's ready; 202 { pending: true } while another request
// (usually the background job started when they were saved) is making it.
export default route(
  {
    async POST(req, res) {
      requireImageKey();
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Not allowed.');
      const { player, status } = await generateBeaten(routeId(req));
      return sendJson(res, status === 'pending' ? 202 : 200, { player, pending: status === 'pending' });
    },
  },
  "Couldn't generate the defeated portrait."
);
