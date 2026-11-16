import { useEffect, useState } from "react";
import { photoUrl } from "./api.js";

/* ------------------------------------------------------------------ */
/* Roster cards are drawn once into a canvas (photo or monogram, gold  */
/* or player-colored frame, name strip) and handed out as blob URLs.   */
/* Each globe facet is then a single element showing a slice of that   */
/* image — no nested DOM per facet and no animated repaints.           */
/* ------------------------------------------------------------------ */

const W = 320;
const H = 400;
const FRAME = { idle: "#f4b521", p1: "#22d3ff", p2: "#ff2e55" };

const pending = new Map(); // key -> Promise<url | null>
const ready = new Map(); // key -> url

let fontsReady = null;
function fonts() {
  fontsReady ??= document.fonts
    ? Promise.all([document.fonts.load("100px Anton"), document.fonts.load("600 40px Teko")]).catch(() => {})
    : Promise.resolve();
  return fontsReady;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function hue(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function drawMonogram(g, name) {
  const h = hue(name);
  const bg = g.createRadialGradient(W * 0.3, H * 0.15, 10, W * 0.3, H * 0.15, H * 1.05);
  bg.addColorStop(0, `hsl(${h} 85% 58%)`);
  bg.addColorStop(0.55, `hsl(${(h + 40) % 360} 80% 26%)`);
  bg.addColorStop(1, `hsl(${(h + 80) % 360} 70% 10%)`);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.save();
  g.globalAlpha = 0.12;
  g.strokeStyle = "#fff";
  g.lineWidth = 3;
  for (let x = -H; x < W + H; x += 14) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H * 0.7, 0); g.stroke(); }
  g.restore();
  g.fillStyle = "rgba(0,0,0,.45)";
  g.beginPath(); g.arc(W / 2, H * 0.6, W * 0.18, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(W * 0.12, H); g.bezierCurveTo(W * 0.14, H * 0.82, W * 0.3, H * 0.76, W / 2, H * 0.76);
  g.bezierCurveTo(W * 0.7, H * 0.76, W * 0.86, H * 0.82, W * 0.88, H); g.fill();
  g.fillStyle = "rgba(255,255,255,.92)";
  g.font = `${Math.round(W * 0.5)}px Anton, Impact, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "top";
  g.shadowColor = "rgba(0,0,0,.45)";
  g.shadowOffsetY = 6;
  g.fillText((name || "?").trim().charAt(0).toUpperCase() || "?", W / 2, H * 0.06);
  g.shadowColor = "transparent";
}

function drawCover(g, img) {
  const r = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * r;
  const h = img.naturalHeight * r;
  g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function drawName(g, name) {
  const strip = g.createLinearGradient(0, H * 0.66, 0, H);
  strip.addColorStop(0, "rgba(0,0,0,0)");
  strip.addColorStop(0.55, "rgba(0,0,0,.7)");
  strip.addColorStop(1, "rgba(0,0,0,.95)");
  g.fillStyle = strip;
  g.fillRect(0, H * 0.66, W, H * 0.34);
  let text = name.toUpperCase();
  g.font = "600 46px Teko, 'Arial Narrow', sans-serif";
  while (g.measureText(text).width > W - 40 && text.length > 1) text = text.slice(0, -1);
  if (text !== name.toUpperCase()) text = `${text.slice(0, -1)}…`;
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillText(text, W / 2, H - 22);
}

function drawFrame(g, variant) {
  const color = FRAME[variant];
  if (variant !== "idle") {
    for (let k = 0; k < 8; k++) {
      g.strokeStyle = color;
      g.globalAlpha = 0.32 - k * 0.04;
      g.lineWidth = 6;
      g.strokeRect(14 + k * 5, 14 + k * 5, W - 28 - k * 10, H - 28 - k * 10);
    }
    g.globalAlpha = 1;
  }
  g.lineWidth = 12;
  g.strokeStyle = color;
  g.strokeRect(8, 8, W - 16, H - 16);
  g.lineWidth = 4;
  g.strokeStyle = "#000";
  g.strokeRect(2, 2, W - 4, H - 4);
}

function drawAdd(g) {
  g.fillStyle = "rgba(0,0,0,.55)";
  g.fillRect(0, 0, W, H);
  g.setLineDash([26, 16]);
  g.lineWidth = 10;
  g.strokeStyle = "#ffd23f";
  g.strokeRect(8, 8, W - 16, H - 16);
  g.setLineDash([]);
  g.fillStyle = "#ffd23f";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `${Math.round(W * 0.5)}px Anton, Impact, sans-serif`;
  g.fillText("+", W / 2, H * 0.42);
  g.font = "600 64px Teko, 'Arial Narrow', sans-serif";
  g.fillText("NEW", W / 2, H * 0.74);
}

function toUrl(canvas, type) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : canvas.toDataURL(type)), type, 0.9);
  });
}

async function render(player, variant) {
  await fonts();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (variant === "add") {
    drawAdd(g);
    return toUrl(canvas, "image/png");
  }
  const src = photoUrl(player);
  let img = null;
  if (src) {
    try { img = await loadImage(src); } catch { /* fall back to monogram */ }
  }
  if (img) drawCover(g, img);
  else drawMonogram(g, player.name);
  drawName(g, player.name);
  drawFrame(g, variant);
  return toUrl(canvas, "image/jpeg");
}

function keyFor(player, variant) {
  return variant === "add" ? "add" : `${player.id}:${player.photo ?? 0}:${player.name}:${variant}`;
}

function texture(player, variant) {
  const key = keyFor(player, variant);
  if (!pending.has(key)) {
    pending.set(key, render(player, variant).then((url) => { if (url) ready.set(key, url); return url; }).catch(() => null));
  }
  return pending.get(key);
}

/** Texture URL for a card; keeps the previous one on screen until the next is ready. */
export function useCardTexture(player, variant) {
  const key = keyFor(player, variant);
  const [url, setUrl] = useState(() => ready.get(key) ?? null);
  useEffect(() => {
    const now = ready.get(key);
    if (now) { setUrl(now); return; }
    let live = true;
    texture(player, variant).then((u) => { if (live && u) setUrl(u); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}
