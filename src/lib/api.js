export async function apiFetch(path, options) {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** URL for a fighter's beaten-up portrait, if one exists for their current photo. */
export function beatenUrl(player) {
  return player?.photo && player.beaten === player.photo
    ? `/api/photos/${encodeURIComponent(player.id)}?v=${player.photo}&kind=beaten`
    : null;
}

/**
 * URL for a fighter's photo, or null when they don't have one yet.
 * photoSrc overrides it (the share-image renderer uses downloaded copies).
 */
export function photoUrl(player) {
  if (player?.photoSrc) return player.photoSrc;
  return player?.photo ? `/api/photos/${encodeURIComponent(player.id)}?v=${player.photo}` : null;
}
