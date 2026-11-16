import { useMemo } from "react";

/** The arena behind every screen: sky, sweeping spotlights, scrolling 3D floor, embers. */
export function Stage() {
  const embers = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        left: `${(i * 61) % 100}%`,
        delay: `${-((i * 1.7) % 9)}s`,
        dur: `${7 + ((i * 3) % 6)}s`,
        drift: `${((i % 5) - 2) * 18}px`,
        size: 2 + (i % 3),
      })),
    []
  );
  return (
    <div className="stage" aria-hidden="true">
      <div className="stage-cam">
        <div className="stage-beam b1" />
        <div className="stage-beam b2" />
        <div className="stage-floor"><div className="stage-floor-grid" /></div>
        {embers.map((e, i) => (
          <span
            key={i}
            className="ember"
            style={{ left: e.left, width: e.size, height: e.size, animationDelay: e.delay, animationDuration: e.dur, "--drift": e.drift }}
          />
        ))}
      </div>
      <div className="stage-vignette" />
      <div className="scanlines absolute inset-0 opacity-60" />
    </div>
  );
}
