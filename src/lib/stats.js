/* ------------------------------------------------------------------ */
/* Derived stats over the roster + chronological game list.            */
/* ------------------------------------------------------------------ */

/** Index the raw API state. Games stay chronological (oldest first). */
export function buildIndex(raw) {
  const players = raw?.players ?? [];
  const games = raw?.games ?? [];
  const byId = new Map(players.map((p) => [p.id, p]));
  return { players, games, byId };
}

/**
 * Games between A and B, newest first, oriented so "1" is always A:
 * { id, createdAt, p1Score (A), p2Score (B), winner: 1 | 2 }.
 * This is the shape DeepStats and the celebration picker expect.
 */
export function matchupGames(games, aId, bId) {
  const out = [];
  for (let i = games.length - 1; i >= 0; i--) {
    const g = games[i];
    let s1, s2;
    if (g.p1Id === aId && g.p2Id === bId) { s1 = g.p1Score; s2 = g.p2Score; }
    else if (g.p1Id === bId && g.p2Id === aId) { s1 = g.p2Score; s2 = g.p1Score; }
    else continue;
    out.push({ id: g.id, createdAt: g.createdAt, p1Score: s1, p2Score: s2, winner: s1 > s2 ? 1 : 2 });
  }
  return out;
}

export function headToHead(games, aId, bId) {
  const list = matchupGames(games, aId, bId);
  const aWins = list.filter((g) => g.winner === 1).length;
  return { aWins, bWins: list.length - aWins, total: list.length };
}

/** Career record for one fighter. streak > 0 = win streak, < 0 = losing streak. */
export function playerRecord(games, id) {
  let wins = 0, losses = 0, pf = 0, pa = 0, streak = 0, best = 0, run = 0;
  for (const g of games) {
    let mine, theirs;
    if (g.p1Id === id) { mine = g.p1Score; theirs = g.p2Score; }
    else if (g.p2Id === id) { mine = g.p2Score; theirs = g.p1Score; }
    else continue;
    pf += mine; pa += theirs;
    if (mine > theirs) {
      wins++;
      streak = streak > 0 ? streak + 1 : 1;
      run++; best = Math.max(best, run);
    } else {
      losses++;
      streak = streak < 0 ? streak - 1 : -1;
      run = 0;
    }
  }
  const played = wins + losses;
  return { wins, losses, played, pointsFor: pf, pointsAgainst: pa, streak, bestStreak: best, winPct: played ? Math.round((wins / played) * 100) : 0 };
}

export function leaderboard(players, games) {
  return players
    .map((p) => ({ player: p, ...playerRecord(games, p.id) }))
    .sort((a, b) => (b.played > 0) - (a.played > 0) || b.wins - a.wins || b.winPct - a.winPct || a.losses - b.losses || a.player.name.localeCompare(b.player.name));
}

/** Every pair that has played, most games first. */
export function rivalries(players, games) {
  const map = new Map();
  for (const g of games) {
    const [a, b] = [g.p1Id, g.p2Id].sort();
    const key = `${a}|${b}`;
    const r = map.get(key) ?? { aId: a, bId: b, total: 0, last: g.createdAt };
    r.total++;
    r.last = g.createdAt;
    map.set(key, r);
  }
  const ids = new Set(players.map((p) => p.id));
  return [...map.values()]
    .filter((r) => ids.has(r.aId) && ids.has(r.bId))
    .sort((x, y) => y.total - x.total || new Date(y.last) - new Date(x.last));
}
