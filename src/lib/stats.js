/* ------------------------------------------------------------------ */
/* Derived stats over the roster + chronological game lists.           */
/* Singles games name one fighter per side (p1Id / p2Id); doubles      */
/* games name a team of two (p1Ids / p2Ids). Everything below works on */
/* either list: a "side" is just a list of fighter ids.                */
/* ------------------------------------------------------------------ */

/** Index the raw API state. Games stay chronological (oldest first). */
export function buildIndex(raw) {
  const players = raw?.players ?? [];
  const games = raw?.games ?? [];
  const doubles = raw?.doubles ?? [];
  const byId = new Map(players.map((p) => [p.id, p]));
  return { players, games, doubles, byId };
}

/** The game list for a team size: 1 = singles, 2 = doubles. */
export function gamesFor(index, size) {
  return size === 2 ? index.doubles : index.games;
}

/** A game's two sides as id lists: [[p1], [p2]] or [[a, b], [c, d]]. */
export function sidesOf(g) {
  return g.p1Ids ? [g.p1Ids, g.p2Ids] : [[g.p1Id], [g.p2Id]];
}

/** Same fighters, in any order. */
export function sameTeam(x, y) {
  return x.length === y.length && x.every((id) => y.includes(id));
}

/** A team's identity regardless of order. */
export function teamKey(ids) {
  return [...ids].sort().join("+");
}

/** "Gabe" or "Gabe & Sai". */
export function teamName(players) {
  return players.map((p) => p.name).join(" & ");
}

const asList = (v) => (Array.isArray(v) ? v : [v]);

/**
 * Games between A and B, newest first, oriented so "1" is always A:
 * { id, createdAt, p1Score (A), p2Score (B), winner: 1 | 2 }.
 * A and B are a fighter id (singles) or a list of ids (doubles).
 * This is the shape RivalryStats and the celebration picker expect.
 */
export function matchupGames(games, a, b) {
  const A = asList(a), B = asList(b);
  const out = [];
  for (let i = games.length - 1; i >= 0; i--) {
    const g = games[i];
    const [x, y] = sidesOf(g);
    let s1, s2;
    if (sameTeam(x, A) && sameTeam(y, B)) { s1 = g.p1Score; s2 = g.p2Score; }
    else if (sameTeam(x, B) && sameTeam(y, A)) { s1 = g.p2Score; s2 = g.p1Score; }
    else continue;
    out.push({ id: g.id, createdAt: g.createdAt, p1Score: s1, p2Score: s2, winner: s1 > s2 ? 1 : 2 });
  }
  return out;
}

export function headToHead(games, a, b) {
  const list = matchupGames(games, a, b);
  const aWins = list.filter((g) => g.winner === 1).length;
  return { aWins, bWins: list.length - aWins, total: list.length };
}

/** W/L over the games where sideOf(g) says which side (1 | 2) we were on, 0 if absent. */
function recordFor(games, sideOf) {
  let wins = 0, losses = 0, pf = 0, pa = 0, streak = 0, best = 0, run = 0;
  for (const g of games) {
    const side = sideOf(g);
    if (!side) continue;
    const mine = side === 1 ? g.p1Score : g.p2Score;
    const theirs = side === 1 ? g.p2Score : g.p1Score;
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

/** Career record for one fighter. streak > 0 = win streak, < 0 = losing streak. */
export function playerRecord(games, id) {
  return recordFor(games, (g) => {
    const [x, y] = sidesOf(g);
    return x.includes(id) ? 1 : y.includes(id) ? 2 : 0;
  });
}

/** Record for one exact team (both partners together). */
export function teamRecord(games, team) {
  return recordFor(games, (g) => {
    const [x, y] = sidesOf(g);
    return sameTeam(x, team) ? 1 : sameTeam(y, team) ? 2 : 0;
  });
}

const byStanding = (a, b) => (b.played > 0) - (a.played > 0) || b.wins - a.wins || b.winPct - a.winPct || a.losses - b.losses;

export function leaderboard(players, games) {
  return players
    .map((p) => ({ player: p, ...playerRecord(games, p.id) }))
    .sort((a, b) => byStanding(a, b) || a.player.name.localeCompare(b.player.name));
}

/** Every team that has played together, best first: [{ team: [player, player], ...record }]. */
export function teamLeaderboard(players, games) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const teams = new Map();
  for (const g of games) {
    for (const side of sidesOf(g)) {
      if (side.length < 2 || !side.every((id) => byId.has(id))) continue;
      const key = teamKey(side);
      if (!teams.has(key)) teams.set(key, side.map((id) => byId.get(id)).sort((a, b) => a.name.localeCompare(b.name)));
    }
  }
  return [...teams.entries()]
    .map(([key, team]) => ({ key, team, ...teamRecord(games, team.map((p) => p.id)) }))
    .sort((a, b) => byStanding(a, b) || teamName(a.team).localeCompare(teamName(b.team)));
}

/** Every pairing of sides that has played, most games first: [{ key, a: ids, b: ids, total, last }]. */
export function rivalries(players, games) {
  const map = new Map();
  for (const g of games) {
    const [x, y] = sidesOf(g).map((s) => [...s].sort());
    const [a, b] = teamKey(x) < teamKey(y) ? [x, y] : [y, x];
    const key = `${teamKey(a)}|${teamKey(b)}`;
    const r = map.get(key) ?? { key, a, b, total: 0, last: g.createdAt };
    r.total++;
    r.last = g.createdAt;
    map.set(key, r);
  }
  const ids = new Set(players.map((p) => p.id));
  return [...map.values()]
    .filter((r) => [...r.a, ...r.b].every((id) => ids.has(id)))
    .sort((x, y) => y.total - x.total || new Date(y.last) - new Date(x.last));
}
