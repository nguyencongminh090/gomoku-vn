'use strict';

/**
 * RatingIntegrityService.js — read-only collusion signals for the admin page (#249). Computes on demand from
 * rating_history; flags are a prompt for human review and never change a rating. Perm: rating.integrity (admin only). Output is a signal to read — nothing here acts on a player.
 */

const database = require('../db/database');
const roles = require('../utils/roles');
const { analyze, THRESHOLDS } = require('../utils/rating-integrity');

class RatingIntegrityError extends Error {
  constructor(code, status, message) { super(message); this.name = 'RatingIntegrityError'; this.code = code; this.status = status; }
}

function report(staffId) {
  if (!roles.can(staffId, 'rating.integrity')) throw new RatingIntegrityError('CHEAT_FORBIDDEN', 403, 'Bạn không có quyền.');
  const db = database.db;
  const rows = db.prepare('SELECT user_id, opponent_id, game_id, score, rating_before, rating_after FROM rating_history').all();
  const result = analyze(rows);
  const ids = new Set();
  for (const p of result.players) { ids.add(p.userId); if (p.topOpponentId) ids.add(p.topOpponentId); }
  for (const p of result.pairs) { ids.add(p.a); ids.add(p.b); }
  for (const g of result.groups) g.members.forEach((m) => ids.add(m));
  const list = [...ids];
  const names = new Map();
  const clubOf = new Map();
  if (list.length) {
    const q = list.map(() => '?').join(',');
    for (const u of db.prepare(`SELECT id, display_name FROM users WHERE id IN (${q})`).all(...list)) names.set(u.id, u.display_name);
    for (const c of db.prepare(`SELECT user_id, club_id FROM club_members WHERE user_id IN (${q})`).all(...list)) {
      if (!clubOf.has(c.user_id)) clubOf.set(c.user_id, new Set());
      clubOf.get(c.user_id).add(c.club_id);
    }
  }
  const friends = new Set(db.prepare("SELECT user_a, user_b FROM friendships WHERE status = 'accepted'").all().map((f) => `${f.user_a}|${f.user_b}`));
  const name = (id) => names.get(id) || '(đã xoá)';
  const areFriends = (a, b) => friends.has(a < b ? `${a}|${b}` : `${b}|${a}`);
  const sameClub = (a, b) => { const x = clubOf.get(a); const y = clubOf.get(b); return !!x && !!y && [...x].some((c) => y.has(c)); };
  return {
    population: result.population,
    thresholds: THRESHOLDS,
    players: result.players.map((p) => ({ ...p, displayName: name(p.userId), topOpponentName: p.topOpponentId ? name(p.topOpponentId) : null,
      topOpponentFriend: p.topOpponentId ? areFriends(p.userId, p.topOpponentId) : false, topOpponentSameClub: p.topOpponentId ? sameClub(p.userId, p.topOpponentId) : false })),
    pairs: result.pairs.map((p) => ({ ...p, aName: name(p.a), bName: name(p.b), friends: areFriends(p.a, p.b), sameClub: sameClub(p.a, p.b) })),
    groups: result.groups.map((g) => ({ ...g, names: g.members.map(name) })),
  };
}

module.exports = { report, RatingIntegrityError };
