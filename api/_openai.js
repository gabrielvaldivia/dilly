import { HttpError } from './_state.js';

// Shared OpenAI image-edit call for the portrait endpoints. The key lives
// only in the server environment (OPENAI_API_KEY) and never reaches the
// browser. Model and quality can be overridden with OPENAI_IMAGE_MODEL /
// OPENAI_IMAGE_QUALITY.
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'medium';
const TIMEOUT_MS = 110_000;

export function requireImageKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new HttpError(503, "Arcade portraits aren't set up on this server yet.");
  return key;
}

/** Edit a JPEG with a prompt; resolves to the generated 1024×1024 JPEG bytes. */
export async function editImage(jpegBytes, prompt) {
  const key = requireImageKey();
  const form = new FormData();
  form.append('model', MODEL);
  form.append('image', new Blob([jpegBytes], { type: 'image/jpeg' }), 'fighter.jpg');
  form.append('prompt', prompt);
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
  return Buffer.from(b64, 'base64');
}
