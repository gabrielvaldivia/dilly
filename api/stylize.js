import { decodePhoto, readBody, route, sendJson, HttpError } from './_state.js';
import { STYLE_PROMPT } from './_stylePrompt.js';

// POST /api/stylize { photo: "data:image/jpeg;base64,…" }
//   → { image: "data:image/jpeg;base64,…" }  (1024×1024 arcade portrait)
//
// The OpenAI key lives only in the server environment (OPENAI_API_KEY);
// it never reaches the browser. Model and quality can be overridden with
// OPENAI_IMAGE_MODEL / OPENAI_IMAGE_QUALITY.
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'medium';
const TIMEOUT_MS = 110_000;

export default route(
  {
    async POST(req, res) {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new HttpError(503, "Arcade portraits aren't set up on this server yet.");
      // Only the app's own pages may spend image credits from a browser.
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Not allowed.');

      const body = (await readBody(req)) || {};
      const photo = decodePhoto(body.photo);

      const form = new FormData();
      form.append('model', MODEL);
      form.append('image', new Blob([photo], { type: 'image/jpeg' }), 'fighter.jpg');
      form.append('prompt', STYLE_PROMPT);
      form.append('size', '1024x1024');
      form.append('quality', QUALITY);
      form.append('output_format', 'jpeg');

      let out;
      try {
        const r = await fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST',
          headers: { authorization: `Bearer ${key}` },
          body: form,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        out = await r.json().catch(() => ({}));
        if (!r.ok) {
          console.error('image edit failed', r.status, out?.error?.message);
          const blocked = out?.error?.code === 'moderation_blocked' || /safety|moderation/i.test(out?.error?.message || '');
          throw new HttpError(502, blocked ? 'The image service declined that photo. Try another one.' : "Couldn't generate the portrait. Try again.");
        }
      } catch (err) {
        if (err instanceof HttpError) throw err;
        console.error('image edit error', err);
        throw new HttpError(504, 'The portrait took too long. Try again.');
      }

      const b64 = out?.data?.[0]?.b64_json;
      if (!b64) throw new HttpError(502, "Couldn't generate the portrait. Try again.");
      return sendJson(res, 200, { image: `data:image/jpeg;base64,${b64}` });
    },
  },
  "Couldn't generate the portrait."
);
