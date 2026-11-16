/** Extruded arcade title text. tone: "gold" (default) | "p1" | "p2" | "chrome". */
export function FxText({ children, tone = "gold", className = "", style, glow, as: Tag = "span", ...rest }) {
  const toneClass = tone === "p1" ? "fx-p1" : tone === "p2" ? "fx-p2" : tone === "chrome" ? "fx-chrome" : "";
  return (
    <Tag
      className={`fx ${toneClass} ${glow ? "fx-glow" : ""} ${className}`}
      style={glow ? { "--glow": glow, ...style } : style}
      {...rest}
    >
      <span className="fx-back" aria-hidden="true">{children}</span>
      <span className="fx-face">{children}</span>
    </Tag>
  );
}
