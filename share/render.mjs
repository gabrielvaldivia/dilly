#!/usr/bin/env node
/*
 * Regenerates the favicon, app icons and link-preview image in public/ from
 * share/index.html (drawn with the app's own components). The link image
 * features the live site's busiest rivalry, with the fighters' real photos.
 *
 *   npm run dev                      # in another terminal
 *   npm run share-assets -- http://localhost:5173 [https://dilly.vercel.app]
 *
 * Needs Google Chrome (set CHROME to use another binary) and ImageMagick.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex, headToHead, playerRecord, rivalries } from "../src/lib/stats.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const pub = path.join(root, "public");
const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const site = (process.argv[3] ?? "https://dilly.vercel.app").replace(/\/$/, "");
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const tmp = mkdtempSync(path.join(tmpdir(), "dilly-share-"));

function shot(query, w, h, out) {
  execFileSync(chrome, [
    "--headless=new",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${w},${h}`,
    "--default-background-color=00000000",
    "--virtual-time-budget=8000", // let the web fonts arrive
    `--screenshot=${out}`,
    `${base}/share/index.html?${query}`,
  ], { stdio: "ignore" });
  // Headless Chrome can come back a few pixels short; pin the exact size.
  magick(out, "-background", "none", "-gravity", "northwest", "-extent", `${w}x${h}`, out);
}
const magick = (...args) => execFileSync("magick", args, { stdio: "inherit" });
const out = (name) => path.join(pub, name);

/**
 * The two fighters for the link image: the pair with the most games on the
 * live site (both with photos), leader on the left, overall records shown.
 * Their photos are downloaded to share/cache/ (gitignored) for the render.
 */
async function fetchFighters() {
  const res = await fetch(`${site}/api/state`);
  if (!res.ok) throw new Error(`Could not load ${site}/api/state (${res.status})`);
  const index = buildIndex(await res.json());
  const withPhoto = (id) => Boolean(index.byId.get(id)?.photo);
  const pair = rivalries(index.players, index.games).find((r) => withPhoto(r.a[0]) && withPhoto(r.b[0]));
  const ids = pair ? [pair.a[0], pair.b[0]] : index.players.filter((p) => p.photo).slice(0, 2).map((p) => p.id);
  if (ids.length < 2) throw new Error("Need two fighters with photos on the live site.");
  const h = headToHead(index.games, ids[0], ids[1]);
  if (h.bWins > h.aWins) ids.reverse();

  const cache = path.join(root, "share", "cache");
  mkdirSync(cache, { recursive: true });
  const fighters = [];
  for (const id of ids) {
    const p = index.byId.get(id);
    const photo = await fetch(`${site}/api/photos/${encodeURIComponent(id)}?v=${p.photo}`);
    if (!photo.ok) throw new Error(`Could not download ${p.name}'s photo (${photo.status})`);
    const file = `${fighters.length + 1}.jpg`;
    writeFileSync(path.join(cache, file), Buffer.from(await photo.arrayBuffer()));
    const { played, wins, losses } = playerRecord(index.games, id);
    fighters.push({ player: { id, name: p.name, photo: p.photo, photoSrc: `./cache/${file}` }, record: { played, wins, losses } });
  }
  writeFileSync(path.join(cache, "og.json"), JSON.stringify({ site, fighters }, null, 2));
  return fighters;
}

try {
  const fighters = await fetchFighters();
  console.log(`Link image: ${fighters.map((f) => f.player.name).join(" vs ")} (from ${site})`);

  // Link preview (Open Graph / Twitter): JPEG keeps the gradients small.
  shot("asset=og", 1200, 630, path.join(tmp, "og.png"));
  magick(path.join(tmp, "og.png"), "-background", "#07050f", "-flatten", "-quality", "88", out("og.jpg"));

  // App icons: full-bleed square (iOS and Android round the corners).
  const square = path.join(tmp, "square.png");
  shot("asset=icon&shape=square", 512, 512, square);
  copyFileSync(square, out("icon-512.png"));
  magick(square, "-filter", "Lanczos", "-resize", "192x192", out("icon-192.png"));
  magick(square, "-filter", "Lanczos", "-resize", "180x180", "-background", "#07050f", "-flatten", out("apple-touch-icon.png"));

  // Android adaptive icon: the mark sits inside the 80% safe zone.
  shot("asset=icon&shape=maskable", 512, 512, out("icon-maskable-512.png"));

  // Browser tab: rounded square with clear corners, 16/32/48 in one .ico.
  const round = path.join(tmp, "round.png");
  shot("asset=icon&shape=round", 512, 512, round);
  magick(round, "-filter", "Lanczos", "-define", "icon:auto-resize=48,32,16", out("favicon.ico"));
  magick(round, "-filter", "Lanczos", "-resize", "32x32", out("favicon-32.png"));

  console.log("Wrote og.jpg, icon-512.png, icon-192.png, apple-touch-icon.png, icon-maskable-512.png, favicon.ico, favicon-32.png to public/");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
