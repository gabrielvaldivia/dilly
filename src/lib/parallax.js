import { useEffect } from "react";

const TARGETS = ".stage-cam, .preview, .globe-rot";

/**
 * Mouse parallax for desktop: writes --px / --py (-1..1) straight onto the
 * few elements that use them. The properties are registered as
 * non-inherited (see theme.css), so an update restyles only those elements
 * instead of the whole page. Touch devices get no parallax at all — no
 * sensor listeners, no per-frame style work.
 */
export function useParallax() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let raf = 0, nx = 0, ny = 0;
    const apply = () => {
      raf = 0;
      const x = nx.toFixed(3), y = ny.toFixed(3);
      document.querySelectorAll(TARGETS).forEach((el) => {
        el.style.setProperty("--px", x);
        el.style.setProperty("--py", y);
      });
    };
    const onPointer = (e) => {
      if (e.pointerType !== "mouse") return;
      nx = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
      ny = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1));
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}
