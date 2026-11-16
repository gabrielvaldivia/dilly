import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const apiDir = path.join(root, 'api');
const blobShim = path.join(root, 'dev/blob-shim.js');

/**
 * Resolve /api/a/b/c to a file in api/ the way Vercel does: exact names
 * first, then `[param]` files/dirs. Files starting with `_` are not routes.
 */
function resolveApiRoute(segments, dir = apiDir, params = {}) {
  const [head, ...rest] = segments;
  if (!head || head.startsWith('_')) return null;
  const entries = readdirSync(dir);
  const dynamic = (isDir) =>
    entries.find((e) => (isDir ? /^\[\w+\]$/.test(e) && statSync(path.join(dir, e)).isDirectory() : /^\[\w+\]\.js$/.test(e)));

  if (!rest.length) {
    if (existsSync(path.join(dir, `${head}.js`))) return { file: path.join(dir, `${head}.js`), params };
    if (existsSync(path.join(dir, head, 'index.js'))) return { file: path.join(dir, head, 'index.js'), params };
    const dyn = dynamic(false);
    return dyn ? { file: path.join(dir, dyn), params: { ...params, [dyn.slice(1, -4)]: head } } : null;
  }
  const sub = path.join(dir, head);
  if (existsSync(sub) && statSync(sub).isDirectory()) {
    const found = resolveApiRoute(rest, sub, params);
    if (found) return found;
  }
  const dynDir = dynamic(true);
  return dynDir ? resolveApiRoute(rest, path.join(dir, dynDir), { ...params, [dynDir.slice(1, -1)]: head }) : null;
}

// Dev only: serve the Vercel functions in /api from the Vite dev server,
// with @vercel/blob swapped for a local file store (.dev-data/).
function localApi() {
  return {
    name: 'dilly-local-api',
    apply: 'serve',
    enforce: 'pre',
    // Keep Vite from handing the import straight to Node, so resolveId can swap it.
    config: () => ({ ssr: { noExternal: ['@vercel/blob'] } }),
    resolveId(id, _importer, options) {
      if (id === '@vercel/blob' && options?.ssr) return blobShim;
    },
    configureServer(server) {
      // Server-only secrets for the local /api handlers, from .env.local.
      // Only OPENAI_* is loaded, and it never reaches the browser bundle
      // (the client only sees VITE_-prefixed variables).
      for (const [k, v] of Object.entries(loadEnv('development', root, 'OPENAI_'))) process.env[k] ??= v;
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();
        const segments = url.pathname.slice(5).split('/').filter(Boolean).map(decodeURIComponent);
        const match = resolveApiRoute(segments);
        if (!match) {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          return res.end(JSON.stringify({ error: 'Not found' }));
        }
        req.query = { ...Object.fromEntries(url.searchParams), ...match.params };
        try {
          const { default: handler } = await server.ssrLoadModule(match.file);
          await handler(req, res);
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [localApi(), react(), tailwindcss()],
  server: { host: true, watch: { ignored: ['**/.dev-data/**'] } },
  build: { outDir: 'dist' },
});
