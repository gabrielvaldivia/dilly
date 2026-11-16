/* Small SVG icon set — chunky square-ended strokes to match the arcade UI.
   Icons inherit color from `currentColor` and size from className. */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "square",
  strokeLinejoin: "miter",
  "aria-hidden": true,
  focusable: "false",
};

export function IconBack({ className = "h-4 w-4" }) {
  return <svg viewBox="0 0 24 24" className={className} strokeWidth="3.4" {...stroke}><path d="M15 4.5L7.5 12 15 19.5" /></svg>;
}

export function IconClose({ className = "h-5 w-5" }) {
  return <svg viewBox="0 0 24 24" className={className} strokeWidth="3.2" {...stroke}><path d="M6 6l12 12M18 6L6 18" /></svg>;
}

export function IconChevronDown({ className = "h-3 w-3" }) {
  return <svg viewBox="0 0 24 24" className={className} strokeWidth="3.4" {...stroke}><path d="M5 8.5l7 7 7-7" /></svg>;
}

export function IconPlus({ className = "h-4 w-4" }) {
  return <svg viewBox="0 0 24 24" className={className} strokeWidth="3.4" {...stroke}><path d="M12 4.5v15M4.5 12h15" /></svg>;
}

export function IconArrowRight({ className = "h-3 w-3" }) {
  return <svg viewBox="0 0 24 24" className={className} strokeWidth="3" {...stroke}><path d="M4 12h15M13 6l6 6-6 6" /></svg>;
}

export function IconStar({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 2.2l2.95 6.2 6.8.8-5 4.7 1.3 6.7L12 17.3l-6.05 3.3 1.3-6.7-5-4.7 6.8-.8z" />
    </svg>
  );
}

export function IconCaretDown({ className = "h-3 w-3" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M4 7h16l-8 11z" />
    </svg>
  );
}
