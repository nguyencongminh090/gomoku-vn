'use strict';

/**
 * doubleElim.js — Standard seeded double-elimination bracket.
 *
 * generateBracket() builds the FULL slot-graph up front (every match in
 * every round, winners + losers + grand final), independent of any actual
 * result — matches reference each other by id ({type:'winner'|'loser',
 * matchId}) rather than by player, since who actually lands in a given slot
 * depends on results that don't exist yet. resolveBracket() then fills in
 * real participants/winners once results are supplied, recursively resolving
 * slot references (memoized, since e.g. the winners-bracket final feeds both
 * the grand final AND the losers bracket).
 *
 * Byes: the field is padded to the next power of two with phantom (null)
 * seeds. Standard seeding order (computeSeedOrder) pairs seed 1 vs seed N,
 * 2 vs N-1, etc. — since phantom seeds occupy the highest seed numbers, they
 * always land opposite a TOP seed in round 1, i.e. byes go to the top seeds.
 *
 * Pure functions — no I/O, no coupling to TournamentManager's Maps.
 */

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Standard bracket seeding order: for a field of size n (power of two),
 * returns the seed numbers in the order they occupy bracket slots, so that
 * seedOrder[2i] plays seedOrder[2i+1] in round 1, and top seeds are kept
 * apart as long as possible (1 and 2 can only meet in the final).
 */
function computeSeedOrder(n) {
  let seeds = [1, 2];
  let size = 2;
  while (size < n) {
    size *= 2;
    const next = [];
    for (const s of seeds) next.push(s, size + 1 - s);
    seeds = next;
  }
  return seeds;
}

/**
 * Build the full double-elimination bracket skeleton for a field of players.
 *
 * @param {string[]} players — in seed order (players[0] = seed 1, the top seed)
 * @returns {{
 *   size: number,
 *   playersBySeed: (string|null)[],
 *   winners: {id:string, slotA:object, slotB:object}[][],
 *   losers:  {id:string, slotA:object, slotB:object}[][],
 *   grandFinal: {id:string, slotA:object, slotB:object}|null,
 * }}
 */
function generateBracket(players) {
  const nReal = players.length;
  if (nReal === 0) {
    return { size: 0, playersBySeed: [], winners: [], losers: [], grandFinal: null };
  }

  const size = nextPowerOfTwo(Math.max(nReal, 2));
  const seedOrder = computeSeedOrder(size);
  const playersBySeed = Array.from({ length: size }, (_, i) => (i < nReal ? players[i] : null));

  // Winners bracket: round 1 from the seed order, every later round pairs
  // the previous round's winners two-by-two.
  const winnersRounds = Math.log2(size);
  const winners = [];
  const round1 = [];
  for (let i = 0; i < size / 2; i++) {
    round1.push({
      id: `W1M${i + 1}`,
      slotA: { type: 'seed', seed: seedOrder[2 * i] },
      slotB: { type: 'seed', seed: seedOrder[2 * i + 1] },
    });
  }
  winners.push(round1);
  for (let r = 2; r <= winnersRounds; r++) {
    const prev = winners[r - 2];
    const round = [];
    for (let i = 0; i < prev.length / 2; i++) {
      round.push({
        id: `W${r}M${i + 1}`,
        slotA: { type: 'winner', matchId: prev[2 * i].id },
        slotB: { type: 'winner', matchId: prev[2 * i + 1].id },
      });
    }
    winners.push(round);
  }

  // Losers bracket. A 2-player field (size===2) has no meaningful losers
  // bracket — a single match decides everything, loser is simply eliminated.
  const losers = [];
  if (size >= 4) {
    let lr1 = [];
    for (let i = 0; i < winners[0].length / 2; i++) {
      lr1.push({
        id: `L1M${i + 1}`,
        slotA: { type: 'loser', matchId: winners[0][2 * i].id },
        slotB: { type: 'loser', matchId: winners[0][2 * i + 1].id },
      });
    }
    losers.push(lr1);

    let prevSurvivors = lr1;
    for (let wr = 2; wr <= winnersRounds; wr++) {
      // Drop round: previous losers-bracket survivors vs this winners
      // round's fresh losers.
      const wrLosers = winners[wr - 1];
      const dropRound = [];
      for (let i = 0; i < prevSurvivors.length; i++) {
        dropRound.push({
          id: `L${losers.length + 1}M${i + 1}`,
          slotA: { type: 'winner', matchId: prevSurvivors[i].id },
          slotB: { type: 'loser', matchId: wrLosers[i].id },
        });
      }
      losers.push(dropRound);

      if (wr === winnersRounds) {
        // The drop round against the winners-bracket FINAL's loser IS the
        // losers-bracket final — no further internal survivors round.
        prevSurvivors = dropRound;
        break;
      }

      if (dropRound.length > 1) {
        // Survivors round: pair the drop round's winners among themselves.
        const survivorsRound = [];
        for (let i = 0; i < dropRound.length / 2; i++) {
          survivorsRound.push({
            id: `L${losers.length + 1}M${i + 1}`,
            slotA: { type: 'winner', matchId: dropRound[2 * i].id },
            slotB: { type: 'winner', matchId: dropRound[2 * i + 1].id },
          });
        }
        losers.push(survivorsRound);
        prevSurvivors = survivorsRound;
      } else {
        prevSurvivors = dropRound;
      }
    }
  }

  const winnersFinalId = winners[winners.length - 1][0].id;
  const grandFinal = losers.length > 0
    ? {
      id: 'GF',
      // slotA = winners-bracket finalist (0 losses so far).
      slotA: { type: 'winner', matchId: winnersFinalId },
      // slotB = losers-bracket finalist (already has 1 loss) — if slotB
      // wins here, a bracket-reset match is needed (see needsBracketReset).
      slotB: { type: 'winner', matchId: losers[losers.length - 1][0].id },
    }
    : null;

  return { size, playersBySeed, winners, losers, grandFinal };
}

/**
 * Resolve every match in a bracket given the results recorded so far.
 *
 * @param {ReturnType<typeof generateBracket>} bracket
 * @param {Map<string, string>} results — matchId -> winnerId, for matches
 *   that were actually played (byes resolve automatically and never need an
 *   entry here).
 * @returns {Record<string, {player1: string|null|undefined, player2: string|null|undefined, winner: string|null|undefined, loser: string|null|undefined, bye?: true}>}
 *   keyed by matchId. `winner`/`loser` are `undefined` while the match is
 *   still pending (one or both participants not yet determined, or both
 *   determined but no result recorded yet).
 */
function resolveBracket(bracket, results) {
  const matchesById = new Map();
  for (const round of bracket.winners) for (const m of round) matchesById.set(m.id, m);
  for (const round of bracket.losers) for (const m of round) matchesById.set(m.id, m);
  if (bracket.grandFinal) matchesById.set(bracket.grandFinal.id, bracket.grandFinal);

  const seedToPlayer = (seed) => bracket.playersBySeed[seed - 1] ?? null;
  const cache = new Map();

  function resolveSlot(slot) {
    if (slot.type === 'seed') return seedToPlayer(slot.seed);
    const m = resolveMatch(slot.matchId);
    return slot.type === 'winner' ? m.winner : m.loser;
  }

  function resolveMatch(matchId) {
    if (cache.has(matchId)) return cache.get(matchId);
    const def = matchesById.get(matchId);
    const a = resolveSlot(def.slotA);
    const b = resolveSlot(def.slotB);

    let outcome;
    if (a === undefined || b === undefined) {
      outcome = { player1: a, player2: b, winner: undefined, loser: undefined };
    } else if (a === null && b === null) {
      outcome = { player1: null, player2: null, winner: null, loser: null };
    } else if (a === null) {
      outcome = { player1: a, player2: b, winner: b, loser: null, bye: true };
    } else if (b === null) {
      outcome = { player1: a, player2: b, winner: a, loser: null, bye: true };
    } else {
      const recorded = results.get(matchId);
      if (recorded === undefined) {
        outcome = { player1: a, player2: b, winner: undefined, loser: undefined };
      } else {
        outcome = { player1: a, player2: b, winner: recorded, loser: recorded === a ? b : a };
      }
    }
    cache.set(matchId, outcome);
    return outcome;
  }

  const resolved = {};
  for (const id of matchesById.keys()) resolved[id] = resolveMatch(id);
  return resolved;
}

/**
 * Whether the grand final's outcome requires a bracket-reset match: true
 * exactly when the losers-bracket finalist (grandFinal.slotB — already
 * carrying one loss) wins, which only gives the previously-undefeated
 * winners-bracket finalist (slotA) their first loss, not their second.
 *
 * @param {ReturnType<typeof generateBracket>} bracket
 * @param {Map<string, string>} results
 * @returns {boolean}
 */
function needsBracketReset(bracket, results) {
  if (!bracket.grandFinal) return false;
  const resolved = resolveBracket(bracket, results);
  const gf = resolved[bracket.grandFinal.id];
  if (gf.winner === undefined || gf.winner === null) return false;
  return gf.winner === gf.player2;
}

module.exports = { nextPowerOfTwo, computeSeedOrder, generateBracket, resolveBracket, needsBracketReset };
