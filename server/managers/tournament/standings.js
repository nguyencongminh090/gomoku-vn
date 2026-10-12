'use strict';

/**
 * standings.js — Score table + Buchholz/Sonneborn-Berger tiebreaks (decision
 * 9, features/tournament/planning.md). Pure functions — no I/O.
 *
 * Byes count as a full-round win for score purposes but are excluded from
 * both tiebreak sums (there's no real opponent to weight by).
 */

/**
 * Compute each entry's raw score (1 per win, 0.5 per draw, 1 per bye) and
 * the list of real (non-bye) opponents they've faced.
 *
 * @param {{id: string}[]} entries
 * @param {{player1: string, player2: string|null, winner?: string|'draw'}[]} completedPairings
 * @returns {{id: string, score: number, opponents: string[]}[]}
 */
function computeStandings(entries, completedPairings) {
  const score = new Map(entries.map((e) => [e.id, 0]));
  const opponents = new Map(entries.map((e) => [e.id, []]));

  for (const p of completedPairings) {
    if (p.player2 == null) {
      if (score.has(p.player1)) score.set(p.player1, score.get(p.player1) + 1);
      continue;
    }
    if (p.winner === 'draw') {
      if (score.has(p.player1)) score.set(p.player1, score.get(p.player1) + 0.5);
      if (score.has(p.player2)) score.set(p.player2, score.get(p.player2) + 0.5);
    } else if (p.winner === p.player1 && score.has(p.player1)) {
      score.set(p.player1, score.get(p.player1) + 1);
    } else if (p.winner === p.player2 && score.has(p.player2)) {
      score.set(p.player2, score.get(p.player2) + 1);
    }
    if (opponents.has(p.player1)) opponents.get(p.player1).push(p.player2);
    if (opponents.has(p.player2)) opponents.get(p.player2).push(p.player1);
  }

  return entries.map((e) => ({ id: e.id, score: score.get(e.id) || 0, opponents: opponents.get(e.id) || [] }));
}

/**
 * Compute Buchholz (sum of opponents' scores) and Sonneborn-Berger (sum of
 * defeated opponents' scores + half of drawn opponents' scores) for every
 * entry, from a standings array (as returned by computeStandings) plus the
 * same completed-pairings list.
 *
 * @param {{id: string, score: number}[]} standings
 * @param {{player1: string, player2: string|null, winner?: string|'draw'}[]} completedPairings
 * @returns {{id: string, score: number, buchholz: number, sonnebornBerger: number}[]}
 */
function computeTiebreaks(standings, completedPairings) {
  const scoreById = new Map(standings.map((s) => [s.id, s.score]));
  const resultsAgainst = new Map(standings.map((s) => [s.id, new Map()]));

  for (const p of completedPairings) {
    if (p.player2 == null) continue; // byes have no real opponent to weight by
    if (!resultsAgainst.has(p.player1) || !resultsAgainst.has(p.player2)) continue;
    if (p.winner === 'draw') {
      resultsAgainst.get(p.player1).set(p.player2, 'draw');
      resultsAgainst.get(p.player2).set(p.player1, 'draw');
    } else if (p.winner === p.player1) {
      resultsAgainst.get(p.player1).set(p.player2, 'win');
      resultsAgainst.get(p.player2).set(p.player1, 'loss');
    } else if (p.winner === p.player2) {
      resultsAgainst.get(p.player2).set(p.player1, 'win');
      resultsAgainst.get(p.player1).set(p.player2, 'loss');
    }
  }

  return standings.map((s) => {
    let buchholz = 0;
    let sonnebornBerger = 0;
    for (const [oppId, result] of resultsAgainst.get(s.id)) {
      const oppScore = scoreById.get(oppId) || 0;
      buchholz += oppScore;
      if (result === 'win') sonnebornBerger += oppScore;
      else if (result === 'draw') sonnebornBerger += oppScore / 2;
    }
    return { id: s.id, score: s.score, buchholz, sonnebornBerger };
  });
}

/**
 * Rank a tiebreak table: sort by score, then Buchholz, then Sonneborn-Berger,
 * all descending. Entries tied on all three share the same rank (a genuine,
 * unresolved tie is left as a tie, not arbitrarily broken).
 *
 * @param {{id: string, score: number, buchholz: number, sonnebornBerger: number}[]} tiebreakRows
 * @returns {({id: string, score: number, buchholz: number, sonnebornBerger: number, rank: number})[]}
 */
function rankStandings(tiebreakRows) {
  const sorted = [...tiebreakRows].sort((a, b) =>
    b.score - a.score || b.buchholz - a.buchholz || b.sonnebornBerger - a.sonnebornBerger
  );

  const ranked = [];
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const tied = prev.score === cur.score && prev.buchholz === cur.buchholz && prev.sonnebornBerger === cur.sonnebornBerger;
      if (!tied) rank = i + 1;
    }
    ranked.push({ ...sorted[i], rank });
  }
  return ranked;
}

/**
 * Round-robin ranking (#245). Every player meets the same opponents, so
 * Buchholz is identical for everyone and useless. Order instead: score, then
 * head-to-head points inside the group tied on score (mini-league), then
 * real wins (byes excluded), then Sonneborn-Berger. Still-equal rows share a
 * rank (a 3-way cycle stays a tie).
 *
 * @param {{id: string, score: number, sonnebornBerger: number}[]} tiebreakRows — computeTiebreaks output
 * @param {{player1: string, player2: string|null, winner?: string|'draw'}[]} completedPairings
 * @returns {({id: string, score: number, buchholz?: number, sonnebornBerger: number, headToHead: number, wins: number, rank: number})[]}
 */
function rankRoundRobinStandings(tiebreakRows, completedPairings) {
  const wins = new Map(tiebreakRows.map((r) => [r.id, 0]));
  const points = new Map(tiebreakRows.map((r) => [r.id, new Map()])); // id -> oppId -> 1 | 0.5 | 0
  for (const p of completedPairings) {
    if (p.player2 == null) continue;
    if (!points.has(p.player1) || !points.has(p.player2)) continue;
    if (p.winner === 'draw') {
      points.get(p.player1).set(p.player2, 0.5);
      points.get(p.player2).set(p.player1, 0.5);
    } else if (p.winner === p.player1 || p.winner === p.player2) {
      const loser = p.winner === p.player1 ? p.player2 : p.player1;
      wins.set(p.winner, wins.get(p.winner) + 1);
      points.get(p.winner).set(loser, 1);
      points.get(loser).set(p.winner, 0);
    }
  }

  const idsByScore = new Map();
  for (const r of tiebreakRows) {
    if (!idsByScore.has(r.score)) idsByScore.set(r.score, new Set());
    idsByScore.get(r.score).add(r.id);
  }
  const rows = tiebreakRows.map((r) => {
    const group = idsByScore.get(r.score);
    let headToHead = 0;
    for (const [oppId, pts] of points.get(r.id)) if (group.has(oppId)) headToHead += pts;
    return { ...r, headToHead, wins: wins.get(r.id) };
  });

  const cmp = (a, b) => b.score - a.score || b.headToHead - a.headToHead || b.wins - a.wins || b.sonnebornBerger - a.sonnebornBerger;
  rows.sort(cmp);
  let rank = 1;
  return rows.map((row, i) => {
    if (i > 0 && cmp(rows[i - 1], row) !== 0) rank = i + 1;
    return { ...row, rank };
  });
}

module.exports = { computeStandings, computeTiebreaks, rankStandings, rankRoundRobinStandings };
