import { loadPhoto, route, routeId, HttpError } from '../_state.js';

// GET /api/photos/:playerId?v=<version>
// Photos are stored per version, so a versioned URL never changes content
// and can be cached hard by the browser.
export default route(
  {
    async GET(req, res) {
      const id = routeId(req);
      const v = Number(new URL(req.url, 'http://localhost').searchParams.get('v'));
      if (!id || !Number.isInteger(v)) throw new HttpError(400, 'Missing photo version.');
      const bytes = await loadPhoto(id, v);
      if (!bytes) throw new HttpError(404, 'Photo not found.');
      res.statusCode = 200;
      res.setHeader('content-type', 'image/jpeg');
      res.setHeader('cache-control', 'public, max-age=31536000, immutable');
      res.end(bytes);
    },
  },
  'Could not load that photo.'
);
