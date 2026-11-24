import { haptic, sfx } from "../lib/sfx.js";

const MODES = [
  { id: "singles", short: "1V1", label: "Singles" },
  { id: "doubles", short: "2V2", label: "Doubles" },
];

/** Singles / doubles toggle: a slanted two-segment arcade switch. */
export function ModeSwitch({ mode, onChange, className = "" }) {
  const pick = (id) => {
    if (id === mode) return;
    sfx.select(id === "singles" ? 1 : 2);
    haptic(10);
    onChange(id);
  };
  return (
    <div role="radiogroup" aria-label="Match type" className={`mode-switch ${className}`}>
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={mode === m.id}
          aria-label={m.label}
          onClick={() => pick(m.id)}
          className={`mode-seg font-hud font-bold active:scale-95 ${mode === m.id ? "is-on" : ""}`}
        >
          <span>{m.short}</span>
        </button>
      ))}
    </div>
  );
}
