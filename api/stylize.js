import { decodePhoto, readBody, route, sendJson, HttpError } from './_state.js';
import { editImage, requireImageKey } from './_openai.js';
import { STYLE_PROMPT } from './_stylePrompt.js';

// POST /api/stylize { photo: "data:image/jpeg;base64,…" }
//   → { image: "data:image/jpeg;base64,…" }  (1024×1024 arcade portrait)
export default route(
  {
    async POST(req, res) {
      requireImageKey();
      // Only the app's own pages may spend image credits from a browser.
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Not allowed.');
      const body = (await readBody(req)) || {};
      const photo = decodePhoto(body.photo);
      const image = await editImage(photo, STYLE_PROMPT);
      return sendJson(res, 200, { image: `data:image/jpeg;base64,${image.toString('base64')}` });
    },
  },
  "Couldn't generate the portrait."
);
