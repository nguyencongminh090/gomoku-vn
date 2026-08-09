'use strict';

/**
 * swiss.js — Simplified score-group / fold pairing for a single Swiss round.
 *
 * Not full FIDE Dutch pairing: this repo's board color comes from the Swap2
 * opening rule (GameEngine), not from pairing, so the color-balancing half of
 * Dutch pairing has nothing to balance — only the parts that matter for a
 * gomoku tournament are implemented: score-group grouping, top/bottom fold
 * pairing within a group, rematch avoidance, and single-bye-per-player.
 *
 * Pure function — no I/O, no coupling to TournamentManager's Maps. Input
 * shape: `{ id, score, opponents: Set<id>, hadBye: boolean }[]`.
 */

/**
 * Generate the pairings for the next round from the current standings.
 *
 * Algorithm:
 *  1. Sort by score descending. Ties keep the input's relative order
 *     (registration order) — a stable sort, so results are reproducible.
 *  2. If the field is odd, the bye goes to the lowest-scored player who
 *     hasn't already had one (search from the bottom up); everyone else is
 *     paired normally.
 *  3. Walk score groups top-down. An odd-sized group floats its lowest
 *     player down into the next group (see the parity-invariant note below).
 *  4. Within a group, split top half / bottom half and fold-pair
 *     (top[i] vs bottom[i]), skipping any bottom candidate already played by
 *     that top player when a non-rematch candidate exists.
 *
 * @param {{id: string, score: number, opponents: Set<string>, hadBye: boolean}[]} standings
 * @returns {{player1: string, player2: string|null}[]} pairings; player2:null = bye
 */
function generateNextRound(standings) {
  const sorted = [...standings].sort((a, b) => b.score - a.score);

  let bye = null;
  let pairable = sorted;
  if (sorted.length % 2 !== 0) {
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (!sorted[i].hadBye) { bye = sorted[i]; break; }
    }
    // Everyone already had a bye (shouldn't happen within a single
    // player's one-bye budget across a realistic number of rounds) — fall
    // back to the lowest scorer rather than throwing.
    if (!bye) bye = sorted[sorted.length - 1];
    pairable = sorted.filter((p) => p !== bye);
  }

  const groups = groupByScore(pairable);
  const pairings = [];
  let carry = [];

  for (const group of groups) {
    let g = carry.concat(group);
    carry = [];
    if (g.length % 2 !== 0) {
      carry.push(g[g.length - 1]);
      g = g.slice(0, -1);
    }

    const half = g.length / 2;
    const top = g.slice(0, half);
    const bottom = g.slice(half);
    const usedBottom = new Set();

    for (const p1 of top) {
      let idx = bottom.findIndex((p2, j) => !usedBottom.has(j) && !p1.opponents.has(p2.id));
      if (idx === -1) idx = bottom.findIndex((p2, j) => !usedBottom.has(j));
      usedBottom.add(idx);
      pairings.push({ player1: p1.id, player2: bottom[idx].id });
    }
  }

  // Invariant: `pairable.length` is always even (the bye already absorbed
  // the one odd player, if any), and each group either starts even or
  // receives exactly one floater to become even — so by induction `carry`
  // must be empty once every group has been processed. If this ever fires,
  // a future edit broke that invariant; it is not reachable as written.
  if (carry.length > 0) {
    throw new Error('swiss pairing: unresolved floater after final score group (parity invariant violated)');
  }

  if (bye) pairings.push({ player1: bye.id, player2: null });

  return pairings;
}

/** Group a score-descending-sorted array into consecutive equal-score runs. */
function groupByScore(sortedPairable) {
  const groups = [];
  let current = [];
  let currentScore = null;
  for (const p of sortedPairable) {
    if (currentScore === null || p.score === currentScore) {
      current.push(p);
      currentScore = p.score;
    } else {
      groups.push(current);
      current = [p];
      currentScore = p.score;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

module.exports = { generateNextRound };
