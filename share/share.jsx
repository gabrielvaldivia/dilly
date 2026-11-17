import React from "react";
import { createRoot } from "react-dom/client";
import { FxText } from "../src/components/FxText.jsx";
import { Stage } from "../src/components/Stage.jsx";
import { PreviewPanel } from "../src/screens/SelectScreen.jsx";
import "../src/theme.css";

/* ------------------------------------------------------------------ */
/* Share assets, drawn with the app's own pieces (Stage, FxText, the   */
/* select-screen panels) and screenshotted by share/render.mjs:        */
/*   /share/index.html?asset=og                 1200 x 630 link image  */
/*   /share/index.html?asset=icon&shape=…        512 x 512 app icon     */
/*     shape: square (full bleed) | round (favicon) | maskable          */
/* The link image shows real fighters: render.mjs picks the busiest    */
/* rivalry on the live site and writes share/cache/og.json + photos.   */
/* ------------------------------------------------------------------ */

const params = new URLSearchParams(location.search);
const asset = params.get("asset") ?? "og";
const shape = params.get("shape") ?? "square";
const noop = () => {};

function Og({ fighters }) {
  const [p1, p2] = fighters;
  return (
    <div className="relative h-[630px] w-[1200px] overflow-hidden">
      <Stage />
      <div className="absolute left-[56px] top-[118px] h-[430px] w-[250px]">
        <PreviewPanel side="p1" player={p1.player} record={p1.record} slamKey={0} onFocus={noop} onEdit={noop} />
      </div>
      <div className="absolute right-[56px] top-[118px] h-[430px] w-[250px]">
        <PreviewPanel side="p2" player={p2.player} record={p2.record} slamKey={0} onFocus={noop} onEdit={noop} />
      </div>
      <div className="absolute inset-x-[330px] top-[190px] flex flex-col items-center">
        <FxText className="text-[188px]" glow="#ff8a1f">Dilly</FxText>
        <span className="brand-plate relative z-10 -mt-[10px]" style={{ padding: "6px 22px 2px 26px" }}>
          <span className="font-hud block whitespace-nowrap text-[34px] font-bold tracking-[0.22em] text-white">PICKLEBALL FIGHTERS</span>
        </span>
        <p className="font-hud mt-[40px] whitespace-nowrap text-[30px] font-semibold tracking-[0.14em] text-white/85">PICK YOUR FIGHTER · SETTLE THE SCORE</p>
      </div>
    </div>
  );
}

function Icon() {
  const round = shape === "round";
  const maskable = shape === "maskable";
  return (
    <div
      className="relative flex h-[512px] w-[512px] items-center justify-center overflow-hidden"
      style={{
        borderRadius: round ? 112 : 0,
        background:
          "radial-gradient(90% 60% at 50% 110%, rgba(255, 46, 85, .55), transparent 65%), radial-gradient(80% 55% at 50% -10%, rgba(34, 211, 255, .28), transparent 62%), linear-gradient(180deg, #0a0620 0%, #160a33 46%, #2b0a2a 100%)",
      }}
    >
      {/* The mark keeps inside the maskable safe zone (inner 80% circle). */}
      {/* The tab icon is shown at 16–32px, so its D fills more of the tile. */}
      <FxText
        className={maskable ? "text-[250px]" : round ? "text-[400px]" : "text-[330px]"}
        glow="#ff8a1f"
        style={{ marginTop: maskable ? 4 : round ? 8 : 6, marginLeft: maskable ? -10 : round ? -16 : -12 }}
      >
        D
      </FxText>
    </div>
  );
}

const root = createRoot(document.getElementById("root"));
if (asset === "icon") root.render(<Icon />);
else {
  fetch("./cache/og.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Run npm run share-assets to fetch the fighters."))))
    .then((data) => root.render(<Og fighters={data.fighters} />))
    .catch((e) => root.render(<p style={{ color: "#fff", font: "20px sans-serif", padding: 24 }}>{e.message}</p>));
}
