import { useEffect, useRef } from "react";

const COLORS = ["#ffd23f", "#22d3ff", "#ff2e55", "#ffffff", "#ff7a1a"];

/** Winner-takeover canvas effect. The `mode` changes the physics so each
 *  celebration variant looks different: radial shockwave, upward fountain,
 *  falling rain, twisting spiral, 8-way cross blast, ring-heavy pulses,
 *  vertical columns, or a slow heavy nova. Pure canvas 2D — no balls. */
export function VictoryBurst({ winnerColor, mode = "radial", count = 190, speedMult = 1, ringCount = 4 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.clientWidth * Math.min(window.devicePixelRatio, 2);
      canvas.height = canvas.clientHeight * Math.min(window.devicePixelRatio, 2);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speed = (reduceMotion ? 0.35 : 1) * speedMult;

    const parts = [];
    const W = () => canvas.width, H = () => canvas.height;
    for (let i = 0; i < count; i++) {
      let angle = Math.random() * Math.PI * 2;
      if (mode === "cross") angle = (Math.floor(Math.random() * 8) / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
      if (mode === "fountain") angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
      if (mode === "rain") angle = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      if (mode === "columns") angle = (Math.random() < 0.5 ? -Math.PI / 2 : Math.PI / 2) + (Math.random() - 0.5) * 0.25;
      parts.push({
        x: 0, y: 0,
        vx: 0, vy: 0,
        angle, dist: 0,
        vel: (140 + Math.random() * 520) * speed * (mode === "nova" ? 0.65 : 1),
        size: 1.5 + Math.random() * 3.5,
        color: i % 4 === 0 ? winnerColor : COLORS[i % COLORS.length],
        delay: Math.random() * (mode === "rain" ? 1.4 : 0.55),
        len: 10 + Math.random() * 34,
      });
    }
    const ringPalette = [winnerColor, "#f4f7ee", "#c6f135", winnerColor, "#ffd23c", winnerColor];
    const rings = Array.from({ length: Math.max(1, ringCount) }, (_, i) => ({
      r: 0, vel: (620 - i * 70) * speed, width: 7 - (i % 3), color: ringPalette[i % ringPalette.length], delay: i * 0.24, alpha: 0.9 - i * 0.1,
    }));

    let raf = 0;
    const start = performance.now();
    let last = start;
    const tick = (now) => {
      const t = (now - start) / 1000;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const w = W(), h = H();
      const cx = w / 2, cy = h / 2;
      const maxR = Math.hypot(cx, cy);
      ctx.clearRect(0, 0, w, h);

      for (const ring of rings) {
        if (t < ring.delay) continue;
        ring.r += ring.vel * dt;
        ring.vel *= 0.985;
        const fade = Math.max(0, 1 - ring.r / maxR);
        ctx.beginPath();
        ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = ring.color;
        ctx.globalAlpha = Math.max(0, ring.alpha * fade);
        ctx.lineWidth = ring.width * (0.4 + fade);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (const s of parts) {
        if (t < s.delay) continue;
        s.dist += s.vel * dt;
        s.vel *= mode === "fountain" || mode === "rain" ? 0.995 : 0.96;
        let ang = s.angle;
        if (mode === "spiral") ang = s.angle + s.dist * 0.004;
        let x = cx + Math.cos(ang) * s.dist;
        let y = cy + Math.sin(ang) * s.dist;
        if (mode === "fountain") y += (s.dist * s.dist) / (maxR * 1.6); // gravity arc
        if (mode === "rain") { x = cx + Math.cos(s.angle) * s.dist * 0.4; y = cy - maxR * 0.4 + s.dist; }
        const fade = Math.max(0, 1 - s.dist / (maxR * 0.95));
        if (fade <= 0) continue;
        const tx = cx + Math.cos(ang) * Math.max(0, s.dist - s.len * fade);
        const ty = cy + Math.sin(ang) * Math.max(0, s.dist - s.len * fade) + (mode === "fountain" ? ((Math.max(0, s.dist - s.len * fade)) ** 2) / (maxR * 1.6) : 0);
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = fade;
        ctx.lineWidth = s.size * fade + 0.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(mode === "rain" ? x : tx, mode === "rain" ? y - s.len * fade : ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, s.size * 0.55 * fade + 0.4, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (t < 4.2) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [winnerColor, mode, count, speedMult, ringCount]);

  return <canvas ref={ref} className="h-full w-full" aria-hidden="true" />;
}
