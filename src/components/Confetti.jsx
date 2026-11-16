import { useEffect, useRef } from "react";

const COLORS = ["#ffd23f", "#22d3ff", "#ff2e55", "#ffffff", "#ff7a1a"];

/** Canvas confetti. Fire by changing `fireKey`.
 *  intensity 1 = the standard two-cannon burst.
 *  intensity 2 = full winner takeover: cannons + centre fountain + rain,
 *  hundreds of pieces, twice as long. */
export function Confetti({ fireKey, intensity = 1 }) {
  const ref = useRef(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; if (fireKey === 0) return; }
    const canvas = ref.current;
    if (!canvas || fireKey === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const mega = intensity === 2;
    const parts = [];
    const cannonCount = mega ? 260 : 160;
    for (let i = 0; i < cannonCount; i++) {
      const fromLeft = i % 2 === 0;
      parts.push({
        x: fromLeft ? 0 : canvas.width, y: canvas.height * 0.75,
        vx: (fromLeft ? 1 : -1) * (4 + Math.random() * (mega ? 13 : 9)),
        vy: -(8 + Math.random() * (mega ? 15 : 10)),
        s: 5 + Math.random() * 7, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        color: COLORS[i % COLORS.length], circle: i % 5 === 0, delay: 0,
      });
    }
    if (mega) {
      // Centre fountain + delayed second wave + top rain.
      for (let i = 0; i < 120; i++) {
        parts.push({
          x: canvas.width / 2 + (Math.random() - 0.5) * 60, y: canvas.height * 0.55,
          vx: (Math.random() - 0.5) * 14, vy: -(12 + Math.random() * 12),
          s: 5 + Math.random() * 8, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
          color: COLORS[i % COLORS.length], circle: i % 4 === 0, delay: 250,
        });
      }
      for (let i = 0; i < 140; i++) {
        parts.push({
          x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height * 0.4,
          vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2.5,
          s: 5 + Math.random() * 7, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.25,
          color: COLORS[(i + 2) % COLORS.length], circle: i % 6 === 0, delay: 700,
        });
      }
    }
    let raf = 0;
    const start = performance.now();
    const duration = mega ? 5600 : 2600;
    const tick = (now) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        if (elapsed < p.delay) continue;
        p.vy += mega ? 0.26 : 0.32; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx *= 0.99;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        if (p.circle) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      if (elapsed < duration) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fireKey, intensity]);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[60]" aria-hidden="true" />;
}
