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
  GAIN_MIN: 40,         // total positive rating gain before the top-opponent share means anything
  GAIN_SHARE: 0.6,      // top opponent supplied this share of positive gain
  HUB_MIN_OPP: 8, HUB_MULT: 3, // hub = >= 8 distinct opponents and >= 3x the median among active players
  PAIR_MIN: 6,          // games inside a pair before asymmetry means anything
  PAIR_SKEW: 0.85,      // one side wins at least this share of decisive pair games
  GROUP_MIN: 3, GROUP_MAX: 8, GROUP_GAMES: 20, GROUP_INTERNAL: 0.9,
};

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Per player: ranked game count and, per opponent, games / positive rating gain / wins / losses. */
function perPlayer(rows) {
  const players = new Map();
  for (const r of rows) {
    let p = players.get(r.user_id);
    if (!p) { p = { id: r.user_id, games: 0, opp: new Map() }; players.set(r.user_id, p); }
    p.games += 1;
    let o = p.opp.get(r.opponent_id);
    if (!o) { o = { games: 0, gain: 0, wins: 0, losses: 0 }; p.opp.set(r.opponent_id, o); }
    o.games += 1;
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
    if (population >= T.POP_MIN && !(top && hubs.has(top.id)) && totalGain >= T.GAIN_MIN && gainShare >= T.GAIN_SHARE) flags.push('gain_from_one');
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
      if (skew >= T.PAIR_SKEW) {
        out.push({ a: p.id, b: oid, games: o.games, aWins: o.wins, bWins: o.losses, skew: round(skew) });
      }
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

module.exports = { analyze, louvain, THRESHOLDS: T };
