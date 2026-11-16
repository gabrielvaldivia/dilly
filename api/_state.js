import { get, put, del } from '@vercel/blob';

const PATH = 'dilly/state.json';
const EPOCH = new Date(0).toISOString();

export const NAME_MAX = 16;
export const ROSTER_MAX = 40;
const PHOTO_MAX_BYTES = 1_500_000;

/* ------------------------------------------------------------------ */
/* State shape                                                         */
/*   players: [{ id, name, createdAt, photo: version | null }]        */
/*   games:   [{ id, createdAt, p1Id, p2Id, p1Score, p2Score }]       */
/*                                                                     */
/* The original app stored a single rivalry: { p1Name, p2Name, games } */
/* with no player ids. That shape is migrated on read into two fighters */
/* with the fixed ids "p1" and "p2", so ids stay stable across reads   */
/* until the next write persists the new shape.                        */
/* ------------------------------------------------------------------ */

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function cleanName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
}

function validScore(v) {
  return Number.isInteger(v) && v >= 0 && v <= 99;
}

function normalizeGame(g) {
  if (!g || typeof g.id !== 'string' || typeof g.createdAt !== 'string') return null;
  if (!validScore(g.p1Score) || !validScore(g.p2Score)) return null;
  if (typeof g.p1Id !== 'string' || typeof g.p2Id !== 'string' || g.p1Id === g.p2Id) return null;
  return { id: g.id, createdAt: g.createdAt, p1Id: g.p1Id, p2Id: g.p2Id, p1Score: g.p1Score, p2Score: g.p2Score };
}

function normalizePlayer(p) {
  if (!p || typeof p.id !== 'string') return null;
  const name = cleanName(p.name);
  if (!name) return null;
  return {
    id: p.id,
    name,
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : EPOCH,
    photo: Number.isInteger(p.photo) ? p.photo : null,
  };
}

function migrateLegacy(data) {
  const d = data && typeof data === 'object' ? data : {};
  const p1Name = cleanName(d.p1Name) || 'Gabe';
  let p2Name = cleanName(d.p2Name) || 'Sai';
  if (p2Name.toLowerCase() === p1Name.toLowerCase()) p2Name = `${p2Name} 2`.slice(0, NAME_MAX);
  const players = [
    { id: 'p1', name: p1Name, createdAt: EPOCH, photo: null },
    { id: 'p2', name: p2Name, createdAt: EPOCH, photo: null },
  ];
  const games = (Array.isArray(d.games) ? d.games : [])
    .map((g) => normalizeGame(g && { ...g, p1Id: 'p1', p2Id: 'p2' }))
    .filter(Boolean);
  return { players, games };
}

function normalize(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.players)) return migrateLegacy(data);
  const seen = new Set();
  const players = data.players.map(normalizePlayer).filter((p) => p && !seen.has(p.id) && seen.add(p.id));
  const games = (Array.isArray(data.games) ? data.games : []).map(normalizeGame).filter(Boolean);
  return { players, games };
}

export async function loadState() {
  let res = null;
  try {
    res = await get(PATH, { access: 'private', useCache: false });
  } catch (err) {
    if (err && (err.name === 'BlobNotFoundError' || err.code === 'not_found')) return migrateLegacy(null);
    throw err;
  }
  if (!res || res.statusCode !== 200 || !res.stream) return migrateLegacy(null);
  const text = await new Response(res.stream).text();
  if (!text) return migrateLegacy(null);
  try {
    return normalize(JSON.parse(text));
  } catch {
    return migrateLegacy(null);
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
  const byDate = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);
  return { players: [...state.players].sort(byDate), games: [...state.games].sort(byDate) };
}

/* ---------------------------- photos ------------------------------ */

export function photoPath(id, version) {
  return `dilly/players/${id}-${version}.jpg`;
}

/** Decode a client-sent `data:image/jpeg;base64,…` URL into bytes. */
export function decodePhoto(dataUrl) {
  const m = typeof dataUrl === 'string' && /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new HttpError(400, 'That photo could not be read. Try taking it again.');
  const buf = Buffer.from(m[1], 'base64');
  if (!buf.length) throw new HttpError(400, 'That photo is empty.');
  if (buf.length > PHOTO_MAX_BYTES) throw new HttpError(413, 'That photo is too large.');
  return buf;
}

/** Upload a new photo version for a player and return the version number. */
export async function savePhoto(id, buf) {
  const version = Date.now();
  await put(photoPath(id, version), buf, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'image/jpeg',
  });
  return version;
}

export async function deletePhoto(id, version) {
  if (!Number.isInteger(version)) return;
  try {
    await del(photoPath(id, version));
  } catch (err) {
    console.error('photo delete failed', err);
  }
}

export async function loadPhoto(id, version) {
  try {
    const res = await get(photoPath(id, version), { access: 'private' });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  } catch (err) {
    if (err && (err.name === 'BlobNotFoundError' || err.code === 'not_found')) return null;
    throw err;
  }
}

/* --------------------------- http utils --------------------------- */

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

/** The `[id]` segment of a dynamic route, from Vercel's req.query or the URL. */
export function routeId(req) {
  let id = req.query && req.query.id;
  if (!id) {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    id = decodeURIComponent(parts[parts.length - 1] || '');
  }
  return typeof id === 'string' ? id : '';
}

/** Build a handler from { METHOD: fn }, with uniform 405 / HttpError / 500 handling. */
export function route(methods, failMessage = 'Scoreboard storage is unavailable right now.') {
  return async function handler(req, res) {
    const fn = methods[req.method];
    if (!fn) return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      console.error(`${req.method} ${req.url} failed`, err);
      return sendJson(res, 500, { error: failMessage });
    }
  };
}
