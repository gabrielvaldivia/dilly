export async function apiFetch(path, options) {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** URL for a fighter's photo, or null when they don't have one yet. */
export function photoUrl(player) {
  return player?.photo ? `/api/photos/${encodeURIComponent(player.id)}?v=${player.photo}` : null;
}
