'use strict';

/**
 * rating-integrity.js — pure collusion signals over the ranked-game graph (#249, features/rating-integrity-graph).
 * Input: rating_history rows { user_id, opponent_id, game_id, score, rating_before, rating_after }.
 * Nodes = players, edge weight = ranked games between a pair. Output flags are for human review only;
 * nothing here touches ratings. Thresholds that depend on the graph being dense enough need POP_MIN *active* players (>= MIN_GAMES games). A hub (one account most others play) is not a suspect:
 * players whose gain/opponents come from a hub are not flagged — real data was a star around one account.
 */

const T = {
  MIN_GAMES: 10,        // player signals need this many ranked games
  POP_MIN: 10,          // below this many ACTIVE players (>= MIN_GAMES games) every graph looks "closed" — entropy/gain-share/community flags stay off
  EFF_OPP_MAX: 2.5,     // effective opponents (2^entropy) at or below this → narrow opponent pool
  GAIN_MIN_GAMES: 20, // gain-from-one needs this many games: with 10–14 games a top opponent trivially holds a big share (#356)
  GAIN_MIN: 40,         // total positive rating gain before the top-opponent share means anything
  GAIN_SHARE: 0.6,      // top opponent supplied this share of positive gain
  HUB_MIN_OPP: 20, HUB_MULT: 3, // hub = >= 20 distinct opponents and >= 3x the median among active players (8 made 18% of active players hubs, #356)
  PAIR_MIN: 6,          // games inside a pair before asymmetry means anything
  PAIR_SKEW: 0.85,      // one side wins at least this share of decisive pair games
  PAIR_Z: 3,            // …and the result is this many σ from the Elo-expected score — a plain skill gap is not a flag (#357)
  GROUP_MIN: 3, GROUP_MAX: 8, GROUP_GAMES: 20, GROUP_INTERNAL: 0.9,
};

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Per player: ranked game count and, per opponent, games / positive rating gain / wins / losses. */
function perPlayer(rows) {
  const players = new Map();
  const before = new Map(); // game_id|user → rating_before, to read the opponent's rating at game time
  for (const r of rows) before.set(r.game_id + '|' + r.user_id, r.rating_before);
  for (const r of rows) {
    let p = players.get(r.user_id);
    if (!p) { p = { id: r.user_id, games: 0, opp: new Map() }; players.set(r.user_id, p); }
    p.games += 1;
    let o = p.opp.get(r.opponent_id);
    if (!o) { o = { games: 0, gain: 0, wins: 0, losses: 0, points: 0, exp: 0, vari: 0, gap: 0 }; p.opp.set(r.opponent_id, o); }
    o.games += 1;
    const ob = before.get(r.game_id + '|' + r.opponent_id);
    const gap = ob === undefined ? 0 : r.rating_before - ob; // unknown opponent rating → treat as equal
    const pe = 1 / (1 + 10 ** (-gap / 400));
    o.points += r.score; o.exp += pe; o.vari += pe * (1 - pe); o.gap += gap;
    const delta = r.rating_after - r.rating_before;
    if (delta > 0) o.gain += delta;
    if (r.score === 1) o.wins += 1; else if (r.score === 0) o.losses += 1;
  }
  return players;
}

/** Accounts most others play (the owner, an active regular). Their opponents' dependence on them is normal. */
function findHubs(players) {
  const active = [...players.values()].filter((p) => p.games >= T.MIN_GAMES).map((p) => p.opp.size).sort((a, b) => a - b);
  if (!active.length) return new Set();
  const median = active[Math.floor(active.length / 2)];
  const hubs = new Set();
  for (const p of players.values()) if (p.opp.size >= T.HUB_MIN_OPP && p.opp.size >= T.HUB_MULT * median) hubs.add(p.id);
  return hubs;
}

function playerSignals(players, population, hubs) {
  const out = [];
  for (const p of players.values()) {
    if (p.games < T.MIN_GAMES) continue;
    let h = 0;
    let totalGain = 0;
    let top = null;
    let most = null;
    for (const [oid, o] of p.opp) {
      const share = o.games / p.games;
      if (!most || o.games > most.games) most = { id: oid, games: o.games };
      h -= share * Math.log2(share);
      totalGain += o.gain;
      if (!top || o.gain > top.gain) top = { id: oid, gain: o.gain };
    }
    const effective = 2 ** h;
    const gainShare = totalGain > 0 && top ? top.gain / totalGain : 0;
    const flags = [];
    if (population >= T.POP_MIN && !hubs.has(most.id) && effective <= T.EFF_OPP_MAX) flags.push('narrow_opponents');
    if (population >= T.POP_MIN && p.games >= T.GAIN_MIN_GAMES && !(top && hubs.has(top.id)) && totalGain >= T.GAIN_MIN && gainShare >= T.GAIN_SHARE) flags.push('gain_from_one');
    if (flags.length) {
      out.push({ userId: p.id, games: p.games, uniqueOpponents: p.opp.size, effectiveOpponents: round(effective),
        topOpponentId: top ? top.id : null, topGainShare: round(gainShare), totalGain: round(totalGain, 1), flags });
    }
  }
  return out;
}

function pairSignals(players) {
  const out = [];
  for (const p of players.values()) {
    for (const [oid, o] of p.opp) {
      if (p.id >= oid || o.games < T.PAIR_MIN) continue;
      const decisive = o.wins + o.losses;
      if (!decisive) continue;
      const skew = Math.max(o.wins, o.losses) / decisive;
      if (skew < T.PAIR_SKEW) continue;
      // z of a's points vs the Elo-expected score at game time (normal approximation; rough below ~10 games)
      const z = o.vari > 0 ? (o.points - o.exp) / Math.sqrt(o.vari) : 0;
      if (Math.abs(z) < T.PAIR_Z) continue;
      const winner = o.wins >= o.losses ? 1 : -1; // +1 = a dominates
      out.push({ a: p.id, b: oid, games: o.games, aWins: o.wins, bWins: o.losses, skew: round(skew), z: round(z, 1),
        weakerWins: winner * o.gap < 0 });
    }
  }
  return out;
}

/** Louvain local-moving on a weighted graph (Map node → Map node → weight; w[i][i] = 2 × internal weight). Returns Map node → community. */
function localMoving(w) {
  const ids = [...w.keys()].sort();
  const deg = new Map(ids.map((i) => [i, [...w.get(i).values()].reduce((a, b) => a + b, 0)]));
  const m2 = [...deg.values()].reduce((a, b) => a + b, 0);
  const comm = new Map(ids.map((i) => [i, i]));
  if (!m2) return comm;
  const tot = new Map(ids.map((i) => [i, deg.get(i)]));
  for (let sweep = 0; sweep < 50; sweep++) {
    let moved = false;
    for (const i of ids) {
      const ci = comm.get(i);
      const k = deg.get(i);
      const links = new Map();
      for (const [j, wt] of w.get(i)) if (j !== i) links.set(comm.get(j), (links.get(comm.get(j)) || 0) + wt);
      tot.set(ci, tot.get(ci) - k);
      let best = ci;
      let bestGain = (links.get(ci) || 0) - (tot.get(ci) * k) / m2;
      for (const c of [...links.keys()].sort()) {
        const gain = links.get(c) - (tot.get(c) * k) / m2;
        if (gain > bestGain + 1e-12) { best = c; bestGain = gain; }
      }
      tot.set(best, tot.get(best) + k);
      if (best !== ci) { comm.set(i, best); moved = true; }
    }
    if (!moved) break;
  }
  return comm;
}

/** Full Louvain: local moving, then collapse each community into one node and repeat until nothing merges.
 *  Deterministic (sorted visit order). A single pass alone can leave one dense group split in halves. */
function louvain(players) {
  let w = new Map([...players.keys()].map((i) => [i, new Map()]));
  for (const p of players.values()) {
    for (const [oid, o] of p.opp) {
      if (!w.has(oid) || oid === p.id) continue;
      w.get(p.id).set(oid, Math.max(w.get(p.id).get(oid) || 0, o.games));
      w.get(oid).set(p.id, Math.max(w.get(oid).get(p.id) || 0, o.games));
    }
  }
  let member = new Map([...w.keys()].map((i) => [i, i])); // original node → current super-node
  for (let level = 0; level < 20; level++) {
    const comm = localMoving(w);
    if (new Set(comm.values()).size === w.size) break;
    member = new Map([...member].map(([i, sn]) => [i, comm.get(sn)]));
    const next = new Map([...new Set(comm.values())].sort().map((c) => [c, new Map()]));
    for (const [i, nbrs] of w) for (const [j, wt] of nbrs) {
      const row = next.get(comm.get(i));
      row.set(comm.get(j), (row.get(comm.get(j)) || 0) + wt);
    }
    w = next;
  }
  return member;
}

function groupSignals(players, population) {
  if (population < T.POP_MIN) return [];
  const comm = louvain(players);
  const members = new Map();
  for (const [id, c] of comm) { if (!members.has(c)) members.set(c, []); members.get(c).push(id); }
  const out = [];
  for (const ids of members.values()) {
    if (ids.length < T.GROUP_MIN || ids.length > T.GROUP_MAX) continue;
    const set = new Set(ids);
    let inside = 0;
    let all = 0;
    for (const id of ids) {
      for (const [oid, o] of players.get(id).opp) { all += o.games; if (set.has(oid)) inside += o.games; }
    }
    if (inside / 2 >= T.GROUP_GAMES && inside / all >= T.GROUP_INTERNAL) {
      out.push({ members: ids.sort(), games: inside / 2, internalShare: round(inside / all) });
    }
  }
  return out;
}

function analyze(rows) {
  const players = perPlayer(rows);
  const active = [...players.values()].filter((p) => p.games >= T.MIN_GAMES).length;
  const hubs = findHubs(players);
  return { population: players.size, activePlayers: active, hubs: [...hubs],
    players: playerSignals(players, active, hubs), pairs: pairSignals(players), groups: groupSignals(players, active) };
}

const VIZ_MAX_NODES = 120;
const RATING_BIN = 100;
const GAME_BINS = [[1, 4], [5, 9], [10, 19], [20, 49], [50, Infinity]];

/** Chart data from the same rows (rows ordered oldest → newest): graph (nodes + pair edges + Louvain community),
 *  scatter points (games vs rating) and two distributions. Descriptive only — flags live in analyze().
 *  `mustKeep`: player ids added to the node list even outside the top VIZ_MAX_NODES. */
function visuals(rows, mustKeep = []) {
  const players = perPlayer(rows);
  const rating = new Map();
  for (const r of rows) rating.set(r.user_id, r.rating_after);
  const comm = louvain(players);
  const size = new Map();
  for (const c of comm.values()) size.set(c, (size.get(c) || 0) + 1);
  const order = [...size].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).map(([c]) => c);
  const commIndex = new Map(order.map((c, i) => [c, i]));
  const all = [...players.values()].sort((a, b) => b.games - a.games || String(a.id).localeCompare(String(b.id)));
  // flagged players are always drawn even when they are not among the most active (#353 suspect-first view)
  const kept = all.slice(0, VIZ_MAX_NODES);
  const have = new Set(kept.map((p) => p.id));
  for (const id of mustKeep) if (!have.has(id) && players.has(id)) { kept.push(players.get(id)); have.add(id); }
  const keep = have;
  const nodes = kept.map((p) => ({ id: p.id, games: p.games, rating: Math.round(rating.get(p.id)), opponents: p.opp.size, community: commIndex.get(comm.get(p.id)), communitySize: size.get(comm.get(p.id)) }));
  const edges = [];
  for (const p of kept) for (const [oid, o] of p.opp) {
    if (keep.has(oid) && p.id < oid) edges.push({ a: p.id, b: oid, games: Math.max(o.games, players.get(oid).opp.get(p.id)?.games || 0) });
  }
  const ratings = all.map((p) => rating.get(p.id));
  const lo = ratings.length ? Math.floor(Math.min(...ratings) / RATING_BIN) * RATING_BIN : 0;
  const hi = ratings.length ? Math.floor(Math.max(...ratings) / RATING_BIN) * RATING_BIN : 0;
  const ratingBins = [];
  if (ratings.length) for (let from = lo; from <= hi; from += RATING_BIN) ratingBins.push({ from, to: from + RATING_BIN - 1, count: ratings.filter((x) => x >= from && x < from + RATING_BIN).length });
  const gamesBins = GAME_BINS.map(([from, to]) => ({ from, to: Number.isFinite(to) ? to : null, count: all.filter((p) => p.games >= from && p.games <= to).length }));
  return { total: all.length, shown: kept.length, communities: order.length, nodes, edges, ratingBins, gamesBins };
}

module.exports = { analyze, visuals, louvain, THRESHOLDS: T };
