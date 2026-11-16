import { get, put } from '@vercel/blob';

const PATH = 'dilly/state.json';

export const DEFAULT_STATE = { p1Name: 'Gabe', p2Name: 'Sai', games: [] };

function cloneDefault() {
  return { p1Name: DEFAULT_STATE.p1Name, p2Name: DEFAULT_STATE.p2Name, games: [] };
}

function normalize(data) {
  if (!data || typeof data !== 'object') return cloneDefault();
  const games = Array.isArray(data.games)
    ? data.games
        .filter(
          (g) =>
            g &&
            typeof g.id === 'string' &&
            Number.isInteger(g.p1Score) &&
            Number.isInteger(g.p2Score) &&
            typeof g.createdAt === 'string'
        )
        .map((g) => ({ id: g.id, createdAt: g.createdAt, p1Score: g.p1Score, p2Score: g.p2Score }))
    : [];
  return {
    p1Name: typeof data.p1Name === 'string' && data.p1Name.trim() ? data.p1Name : 'Gabe',
    p2Name: typeof data.p2Name === 'string' && data.p2Name.trim() ? data.p2Name : 'Sai',
    games,
  };
}

export async function loadState() {
  let res = null;
  try {
    res = await get(PATH, { access: 'private', useCache: false });
  } catch (err) {
    if (err && (err.name === 'BlobNotFoundError' || err.code === 'not_found')) return cloneDefault();
    throw err;
  }
  if (!res || res.statusCode !== 200 || !res.stream) return cloneDefault();
  const text = await new Response(res.stream).text();
  if (!text) return cloneDefault();
  try {
    return normalize(JSON.parse(text));
  } catch {
    return cloneDefault();
  }
}

export async function saveState(state) {
  await put(PATH, JSON.stringify(state), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  });
}

export function publicState(state) {
  const games = [...state.games].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return { p1Name: state.p1Name, p2Name: state.p2Name, games };
}

export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}
