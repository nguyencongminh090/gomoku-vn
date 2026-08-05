'use strict';

/**
 * roundRobin.js — Circle method scheduling.
 *
 * Unlike Swiss/Double Elimination, round robin's entire schedule is fully
 * determined at tournament start (it never depends on results), so it's
 * generated once up front rather than round-by-round.
 *
 * Pure function — no I/O. Input: an array of player ids in seed/registration
 * order. Output: every round's pairings, in order.
 */

/**
 * Generate every round of a round-robin schedule via the circle method: fix
 * player 0, rotate the rest around a circle each round, pairing opposite
 * positions. An odd field gets a synthetic bye seat rotated in with everyone
 * else, so each player sits out exactly one round.
 *
 * @param {string[]} players
 * @returns {{player1: string, player2: string|null}[][]} one array of
 *   pairings per round; player2:null = that round's bye.
 */
function generateAllRounds(players) {
  if (players.length <= 1) return [];

  const list = players.length % 2 === 0 ? [...players] : [...players, null];
  const n = list.length;
  const rounds = n - 1;
  const half = n / 2;
  const arr = [...list];
  const allRounds = [];

  for (let r = 0; r < rounds; r++) {
    const pairings = [];
    for (let i = 0; i < half; i++) {
      const p1 = arr[i];
      const p2 = arr[n - 1 - i];
      if (p1 !== null && p2 !== null) {
        pairings.push({ player1: p1, player2: p2 });
      } else {
        pairings.push({ player1: p1 !== null ? p1 : p2, player2: null });
      }
    }
    allRounds.push(pairings);

    // Rotate: player 0 stays fixed, the rest shift one position clockwise.
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(0, arr.length, fixed, ...rest);
  }

  return allRounds;
}

module.exports = { generateAllRounds };
