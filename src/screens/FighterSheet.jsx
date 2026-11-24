import { useCallback, useEffect, useRef, useState } from "react";
import { FxText } from "../components/FxText.jsx";
import { IconClose } from "../components/Icons.jsx";
import { Portrait } from "../components/Portrait.jsx";
import { apiFetch, photoUrl } from "../lib/api.js";
import { haptic, sfx } from "../lib/sfx.js";

// Captured photo (sent to the portrait generator, kept as a fallback) and
// the final 4:5 card image cut from the square arcade portrait.
const CAPTURE_W = 768;
const CAPTURE_H = 960;
const CARD_W = 720;
const CARD_H = 900;
const NAME_MAX = 16;

/** Center-crop any image/video frame to 4:5 and encode a compact JPEG. */
function cropToJpeg(source, w, h, mirror, outW = CAPTURE_W, outH = CAPTURE_H, quality = 0.85) {
  const ratio = outW / outH;
  let sw = w, sh = w / ratio;
  if (sh > h) { sh = h; sw = h * ratio; }
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (mirror) { ctx.translate(outW, 0); ctx.scale(-1, 1); }
  ctx.drawImage(source, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, outW, outH);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Fit the square arcade portrait into the 4:5 card frame (centre crop). */
function cardFromPortrait(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(cropToJpeg(img, img.naturalWidth, img.naturalHeight, false, CARD_W, CARD_H, 0.88));
    img.onerror = () => reject(new Error("Couldn't read the generated portrait."));
    img.src = dataUrl;
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });
}

export function FighterSheet({ mode, player, gameCount = 0, onClose, onSaved, onDeleted }) {
  const isEdit = mode === "edit";
  const [name, setName] = useState(player?.name ?? "");
  const [shot, setShot] = useState(null); // what gets saved: the arcade portrait, or the raw photo as a fallback
  const [raw, setRaw] = useState(null);
  const [gen, setGen] = useState("idle"); // idle | working | done | failed
  const [genError, setGenError] = useState("");
  const [cam, setCam] = useState("off"); // off | starting | live | blocked | unsupported
  const [facing, setFacing] = useState("user");
  const [flash, setFlash] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const captureRef = useRef(null);
  const libraryRef = useRef(null);
  const nameRef = useRef(null);
  const requestRef = useRef(0);
  const genRef = useRef(0);

  const stop = useCallback(() => {
    requestRef.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async (face) => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) { setCam("unsupported"); return; }
    setCam("starting");
    stop();
    const request = requestRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: face, width: { ideal: 1080 }, height: { ideal: 1350 } },
      });
      // Closed, snapped or restarted while the permission prompt was up: release it.
      if (request !== requestRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      setCam("live");
    } catch (err) {
      if (request !== requestRef.current) return;
      setCam(err?.name === "NotAllowedError" || err?.name === "SecurityError" ? "blocked" : "unsupported");
    }
  }, [stop]);

  useEffect(() => {
    if (!isEdit) start("user");
    return stop;
  }, [isEdit, start, stop]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const afterShot = () => {
    setFlash((f) => f + 1);
    sfx.shutter();
    haptic(20);
    stop();
    setCam("off");
    if (!name.trim()) window.setTimeout(() => nameRef.current?.focus(), 400);
  };

  /** Turn a captured photo into the arcade portrait (server-side, ~30s). */
  const stylize = async (photo) => {
    const id = ++genRef.current;
    setGen("working");
    setGenError("");
    try {
      const { image } = await apiFetch("/api/stylize", { method: "POST", body: JSON.stringify({ photo }) });
      const card = await cardFromPortrait(image);
      if (id !== genRef.current) return;
      setShot(card);
      setGen("done");
      setFlash((f) => f + 1);
      sfx.select(1);
      haptic([20, 40, 20]);
    } catch (err) {
      if (id !== genRef.current) return;
      setGen("failed");
      setGenError(err.message || "Couldn't generate the portrait.");
      sfx.deny();
    }
  };

  const captured = (photo) => {
    setRaw(photo);
    setShot(photo);
    afterShot();
    stylize(photo);
  };

  const snap = () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    captured(cropToJpeg(v, v.videoWidth, v.videoHeight, facing === "user"));
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const img = await loadImage(file);
      captured(cropToJpeg(img, img.naturalWidth, img.naturalHeight, false));
    } catch {
      setError("Couldn't read that photo. Try a different one.");
    }
  };

  const takePhoto = () => {
    if (cam === "blocked" || cam === "unsupported") { captureRef.current?.click(); return; }
    genRef.current++;
    setGen("idle");
    setGenError("");
    setRaw(null);
    setShot(null);
    start(facing);
  };

  const flip = () => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    start(next);
  };

  const submit = async (e) => {
    e.preventDefault();
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean) { setError("Every fighter needs a name."); nameRef.current?.focus(); return; }
    setBusy(true);
    setError("");
    try {
      const body = JSON.stringify({ name: clean, ...(shot ? { photo: shot } : {}) });
      const { player: saved } = isEdit
        ? await apiFetch(`/api/players/${encodeURIComponent(player.id)}`, { method: "PATCH", body })
        : await apiFetch("/api/players", { method: "POST", body });
      stop();
      sfx.select(1);
      haptic([20, 40, 20]);
      onSaved(saved);
    } catch (err) {
      setError(err.message || "Couldn't save. Check your connection.");
      sfx.deny();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 3500);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/players/${encodeURIComponent(player.id)}`, { method: "DELETE" });
      onDeleted(player.id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const live = cam === "live" || cam === "starting";
  const existingPhoto = isEdit && photoUrl(player);
  const displayName = name.trim() || "???";

  return (
    <div className="no-select fixed inset-0 z-50 overflow-y-auto bg-[linear-gradient(180deg,#0b0620_0%,#170b30_55%,#2a0a26_100%)]" role="dialog" aria-modal="true" aria-label={isEdit ? `Edit ${player.name}` : "Add a new fighter"}>
      <div className="challenger-stripes h-2.5 w-full" aria-hidden="true" />
      <form onSubmit={submit} className="sheet-form book-pages pad-x mx-auto flex min-h-[calc(100dvh-10px)] w-full max-w-[480px] flex-col [--pad:20px] pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="sheet-head flex items-start justify-between gap-3">
          <div>
            <p className="font-hud text-[16px] font-semibold text-[var(--accent)] blink">{isEdit ? "FIGHTER PROFILE" : "WARNING"}</p>
            <FxText className="mt-1 text-[clamp(30px,10vw,44px)]">{isEdit ? "Edit fighter" : "New challenger!"}</FxText>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/15 bg-black/50 active:scale-95">
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        {/* Camera page: photo frame + controls */}
        <div className="sheet-camera">
        <div className="relative mx-auto mt-5 aspect-[4/5] w-[min(76vw,46dvh,340px)]">
          <div className="absolute inset-0 overflow-hidden rounded-md bg-black shadow-[0_0_0_3px_#000,0_0_0_5px_var(--accent),0_20px_60px_rgba(0,0,0,.7)]">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`absolute inset-0 h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""} ${live && !shot ? "" : "invisible"}`}
            />
            {shot ? (
              <img src={shot} alt="Fighter portrait" className={`absolute inset-0 h-full w-full object-cover ${gen === "working" ? "grayscale" : ""}`} />
            ) : !live && existingPhoto ? (
              <div className="absolute inset-0"><Portrait player={player} eager /></div>
            ) : !live ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-[#1c1238] to-black p-6 text-center">
                {isEdit ? (
                  <div className="absolute inset-0 opacity-70"><Portrait player={player} eager /></div>
                ) : null}
                <p className="font-hud relative text-[20px] font-semibold text-white/90">
                  {cam === "blocked" ? "CAMERA ACCESS BLOCKED" : cam === "unsupported" ? "LIVE CAMERA UNAVAILABLE" : isEdit ? "" : "WARMING UP CAMERA…"}
                </p>
              </div>
            ) : null}
            {cam === "starting" && !shot && (
              <div className="font-hud absolute inset-0 flex items-center justify-center text-[22px] font-semibold text-white/80 blink">READY?</div>
            )}
            <div className="scanlines pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" aria-hidden="true" />
            <div className="pointer-events-none absolute bottom-3 left-3 right-3" aria-hidden="true">
              <FxText style={{ fontSize: `${Math.min(46, 300 / Math.max(3, displayName.length))}px` }}>{displayName}</FxText>
            </div>
            {gen === "working" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50" role="status" aria-label="Generating arcade portrait">
                <div className="gen-scan pointer-events-none absolute inset-x-0 h-1/4" aria-hidden="true" />
                <FxText className="relative text-[30px]">Powering up</FxText>
                <div className="relative mt-4 h-2.5 w-2/3 overflow-hidden border-2 border-black bg-black/70 shadow-[0_0_0_1px_rgba(255,255,255,.5)]" aria-hidden="true">
                  <div className="gen-bar h-full" />
                </div>
              </div>
            )}
            {gen === "failed" && (
              <div className="font-hud absolute inset-x-0 top-0 bg-[var(--p2)] px-3 pb-0.5 pt-1.5 text-center text-[16px] font-bold text-white">PORTRAIT FAILED — USING PHOTO</div>
            )}
            {flash > 0 && <div key={flash} className="shutter-flash pointer-events-none absolute inset-0 bg-white" aria-hidden="true" />}
          </div>
          <span className="bracket -left-2 -top-2 border-l-4 border-t-4" aria-hidden="true" />
          <span className="bracket -right-2 -top-2 border-r-4 border-t-4" aria-hidden="true" />
          <span className="bracket -bottom-2 -left-2 border-b-4 border-l-4" aria-hidden="true" />
          <span className="bracket -bottom-2 -right-2 border-b-4 border-r-4" aria-hidden="true" />
        </div>

        {/* Camera controls */}
        <div className="mt-6 flex items-center justify-center gap-5">
          {live && !shot ? (
            <>
              <button type="button" onClick={flip} aria-label="Switch camera" className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/50 active:scale-95">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 7h3l2-3h8l2 3h3v12H3z" /><path d="M9 13a3 3 0 015.2-2M15 13a3 3 0 01-5.2 2" /><path d="M14 9.5V11h-1.5M10 16.5V15h1.5" />
                </svg>
              </button>
              <button type="button" onClick={snap} disabled={cam !== "live"} aria-label="Take photo" className="flex h-[78px] w-[78px] items-center justify-center rounded-full border-4 border-white bg-[var(--p2)] shadow-[0_0_0_4px_#000,0_0_30px_rgba(255,46,85,.7)] disabled:opacity-50 active:scale-90">
                <span className="h-[54px] w-[54px] rounded-full border-2 border-black/30 bg-gradient-to-b from-[#ff8aa0] to-[#d1083a]" />
              </button>
              <button type="button" onClick={() => libraryRef.current?.click()} aria-label="Choose from library" className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/50 active:scale-95">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={takePhoto} className="font-hud slant-btn bg-white px-6 pb-1.5 pt-2.5 text-[22px] font-bold text-black active:scale-95">
                {shot ? "RETAKE" : existingPhoto ? "NEW PHOTO" : "TAKE PHOTO"}
              </button>
              <button type="button" onClick={() => libraryRef.current?.click()} className="font-hud slant-btn bg-white/15 px-5 pb-1.5 pt-2.5 text-[22px] font-semibold text-white active:scale-95">
                UPLOAD
              </button>
              {gen === "failed" && raw && (
                <button type="button" onClick={() => stylize(raw)} className="font-hud slant-btn bg-[var(--accent)] px-5 pb-1.5 pt-2.5 text-[22px] font-bold text-black active:scale-95">
                  TRY AGAIN
                </button>
              )}
            </>
          )}
        </div>
        </div>
        <input ref={captureRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFile} />
        <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

        {/* Details page: name + save */}
        <div className="sheet-details">
        <label className="mt-7 block">
          <span className="font-hud text-[17px] font-semibold text-[var(--dim)]">FIGHTER NAME</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
            maxLength={NAME_MAX}
            autoCapitalize="words"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            className="font-display mt-1 w-full rounded-md border-2 border-white/15 bg-black/60 px-4 py-3 text-[28px] uppercase tracking-wide text-white outline-none placeholder:normal-case placeholder:text-white/25 focus:border-[var(--accent)]"
          />
        </label>

        {(error || genError) && <p className="mt-3 text-center text-sm font-bold text-[var(--p2)]" role="alert">{error || genError}</p>}

        <div className="mt-auto pt-6">
          <div className={busy || gen === "working" ? "" : "fight-ready"}>
            <button type="submit" disabled={busy || gen === "working"} className="slant-btn block w-full bg-gradient-to-b from-[#fff3a0] via-[#ffc02e] to-[#ff5a1f] py-3 disabled:opacity-60 active:scale-[0.98]">
              <span className="font-display block text-[30px] leading-none text-[var(--ink)]" style={{ transform: "skewX(-9deg)" }}>
                {busy ? "SAVING…" : gen === "working" ? "POWERING UP…" : isEdit ? "SAVE FIGHTER" : "ENTER THE ARENA"}
              </span>
            </button>
          </div>
          {isEdit && (
            <div className="mt-4">
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className={`font-hud slant-btn block w-full pb-1.5 pt-3 text-[20px] font-semibold active:scale-[0.98] ${confirmDelete ? "bg-[var(--p2)] text-white" : "bg-white/10 text-[var(--p2)]"}`}
              >
                {confirmDelete
                  ? gameCount
                    ? `CONFIRM — ALSO DELETES ${gameCount} GAME${gameCount === 1 ? "" : "S"}`
                    : "CONFIRM DELETE"
                  : "DELETE FIGHTER"}
              </button>
            </div>
          )}
        </div>
        </div>
      </form>
    </div>
  );
}
