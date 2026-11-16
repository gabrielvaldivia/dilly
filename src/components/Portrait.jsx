import { useState } from "react";
import { photoUrl } from "../lib/api.js";

function hue(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/**
 * A fighter's face: their photo, or — until they have one — a generated
 * color card with a silhouette so the roster never shows a blank tile.
 */
export function Portrait({ player, className = "", eager = false }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const src = photoUrl(player);
  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailedSrc(src)}
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  const h = hue(player?.name);
  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{ background: `radial-gradient(120% 90% at 30% 15%, hsl(${h} 85% 58%), hsl(${(h + 40) % 360} 80% 26%) 55%, hsl(${(h + 80) % 360} 70% 10%))` }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 opacity-25" style={{ background: "repeating-linear-gradient(-55deg, rgba(255,255,255,.18) 0 2px, transparent 2px 9px)" }} />
      {/* Head and shoulders, centered both ways whatever the frame's shape. */}
      <svg viewBox="0 0 100 125" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full opacity-45">
        <circle cx="50" cy="33.5" r="19" fill="#000" />
        <path d="M14 110.5 C16 77.5 32 61.5 50 61.5 C68 61.5 84 77.5 86 110.5 Z" fill="#000" />
      </svg>
    </div>
  );
}
