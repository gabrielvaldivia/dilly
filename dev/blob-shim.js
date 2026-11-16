// Dev-only stand-in for `@vercel/blob`, used by the Vite dev server so the
// /api handlers can run locally without touching the hosted Blob store.
// Data is written to .dev-data/ in the project root.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '.dev-data');
const TYPES = { '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

function fileFor(pathname) {
  const file = path.resolve(ROOT, pathname);
  if (!file.startsWith(ROOT + path.sep)) throw new Error(`Invalid blob path: ${pathname}`);
  return file;
}

export async function get(pathname) {
  let bytes;
  try {
    bytes = await readFile(fileFor(pathname));
  } catch (err) {
    if (err.code === 'ENOENT') {
      const notFound = new Error(`Blob not found: ${pathname}`);
      notFound.name = 'BlobNotFoundError';
      throw notFound;
    }
    throw err;
  }
  const contentType = TYPES[path.extname(pathname)] || 'application/octet-stream';
  return {
    statusCode: 200,
    stream: new Blob([bytes]).stream(),
    headers: new Headers({ 'content-type': contentType }),
    blob: { pathname, contentType, size: bytes.length },
  };
}

export async function put(pathname, body) {
  const file = fileFor(pathname);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
  return { pathname, url: `file://${file}` };
}

export async function del(pathnames) {
  for (const p of [].concat(pathnames)) await rm(fileFor(p), { force: true });
}
