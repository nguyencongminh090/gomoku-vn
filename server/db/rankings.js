'use strict';

/** db/rankings.js — split out of database.js (#258); code moved verbatim. */

const { db } = require('./connection');
const { likeEscape } = require('./like');


// ---------------------------------------------------------------------------
// Rankings (#176) — read-only views over `ratings` + `users`
// ---------------------------------------------------------------------------

/** Min rated games before a player appears on a leaderboard (was 20; 1 = anyone with a rating shows, user request 2026-10-12). */
const RANKING_MIN_GAMES = 1;

/**
 * One page of a category's leaderboard, best rating first.
 * Ties break on user_id so pages never overlap or skip rows.
 * @returns {Array<{user_id:string, display_name:string, rating:number, rd:number, games:number}>}
 */
function getRankings(category, limit, offset) {
  return db.prepare(`
    SELECT r.user_id, u.username, u.display_name, u.avatar_v, u.country, u.city, r.rating, r.rd, r.games
    FROM ratings r JOIN users u ON u.id = r.user_id
    WHERE r.category = ? AND r.games >= ?
    ORDER BY r.rating DESC, r.user_id
    LIMIT ? OFFSET ?
  `).all(category, RANKING_MIN_GAMES, limit, offset);
}

/** Rankings restricted to `userIds` (friends + self); rank is within that set. */
function getRankingsAmong(category, userIds, limit, offset) {
  if (!userIds.length) return [];
  const marks = userIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT r.user_id, u.username, u.display_name, u.avatar_v, u.country, u.city, r.rating, r.rd, r.games
    FROM ratings r JOIN users u ON u.id = r.user_id
    WHERE r.category = ? AND r.games >= ? AND r.user_id IN (${marks})
    ORDER BY r.rating DESC, r.user_id
    LIMIT ? OFFSET ?
  `).all(category, RANKING_MIN_GAMES, ...userIds, limit, offset);
}

function countRankingsAmong(category, userIds) {
  if (!userIds.length) return 0;
  const marks = userIds.map(() => '?').join(',');
  return db.prepare(`SELECT COUNT(*) AS n FROM ratings WHERE category = ? AND games >= ? AND user_id IN (${marks})`)
    .get(category, RANKING_MIN_GAMES, ...userIds).n;
}

// Everyone in any club `viewerId` belongs to (pending requests don't count on either side), self included.
const CLUB_CIRCLE_SQL = `SELECT m2.user_id FROM club_members m1 JOIN club_members m2 ON m2.club_id = m1.club_id
  WHERE m1.user_id = ? AND m1.role != 'pending' AND m2.role != 'pending'`;

/** Rankings restricted to the viewer's club-mates (B191 "CLB của tôi"); rank is within that set. */
function getRankingsInMyClubs(category, viewerId, limit, offset) {
  return db.prepare(`
    SELECT r.user_id, u.username, u.display_name, u.avatar_v, u.country, u.city, r.rating, r.rd, r.games
    FROM ratings r JOIN users u ON u.id = r.user_id
    WHERE r.category = ? AND r.games >= ? AND r.user_id IN (${CLUB_CIRCLE_SQL})
    ORDER BY r.rating DESC, r.user_id
    LIMIT ? OFFSET ?
  `).all(category, RANKING_MIN_GAMES, viewerId, limit, offset);
}

function countRankingsInMyClubs(category, viewerId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ratings WHERE category = ? AND games >= ? AND user_id IN (${CLUB_CIRCLE_SQL})`)
    .get(category, RANKING_MIN_GAMES, viewerId).n;
}

/** Rankings of members who set `country` (alpha-2); rank is within that country. */
function getRankingsByCountry(category, country, limit, offset) {
  return db.prepare(`
    SELECT r.user_id, u.username, u.display_name, u.avatar_v, u.country, u.city, r.rating, r.rd, r.games
    FROM ratings r JOIN users u ON u.id = r.user_id
    WHERE r.category = ? AND r.games >= ? AND u.country = ?
    ORDER BY r.rating DESC, r.user_id
    LIMIT ? OFFSET ?
  `).all(category, RANKING_MIN_GAMES, country, limit, offset);
}

function countRankingsByCountry(category, country) {
  return db.prepare('SELECT COUNT(*) AS n FROM ratings r JOIN users u ON u.id = r.user_id WHERE r.category = ? AND r.games >= ? AND u.country = ?')
    .get(category, RANKING_MIN_GAMES, country).n;
}

function getRankingCount(category) {
  return db.prepare('SELECT COUNT(*) AS count FROM ratings WHERE category = ? AND games >= ?')
    .get(category, RANKING_MIN_GAMES).count;
}

/**
 * A user's own standing in a category: their row plus 1-based rank (null while
 * under RANKING_MIN_GAMES), or null if they have no rating there.
 */
function getUserRanking(userId, category) {
  const row = db.prepare('SELECT rating, rd, games FROM ratings WHERE user_id = ? AND category = ?')
    .get(userId, category);
  if (!row) return null;
  let rank = null;
  if (row.games >= RANKING_MIN_GAMES) {
    rank = 1 + db.prepare(`
      SELECT COUNT(*) AS n FROM ratings
      WHERE category = ? AND games >= ? AND (rating > ? OR (rating = ? AND user_id < ?))
    `).get(category, RANKING_MIN_GAMES, row.rating, row.rating, userId).n;
  }
  return { ...row, rank };
}

/** Rated games a user has played in a category (0 if unrated there). */
function getRatedGames(userId, category) {
  const row = db.prepare('SELECT games FROM ratings WHERE user_id = ? AND category = ?').get(userId, category);
  return row ? row.games : 0;
}

/** ISO time of the pair's last applied Elo swap (#222), any category, or null. */
function lastEloSwapAt(a, b) {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const row = db.prepare('SELECT created_at FROM elo_swaps WHERE user_lo = ? AND user_hi = ? ORDER BY created_at DESC LIMIT 1').get(lo, hi);
  return row ? row.created_at : null;
}


// ---------------------------------------------------------------------------
// Rankings phase 2 (#190): 7-day change, name search, primary club, rating series
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Net rating change over the last 7 days per user (users with no games are absent). @returns {Map<string, number>} */
function getRatingDeltas7(category, userIds) {
  const out = new Map();
  if (!userIds.length) return out;
  const since = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const rows = db.prepare(`
    SELECT user_id, SUM(rating_after - rating_before) AS d FROM rating_history
    WHERE category = ? AND created_at >= ? AND user_id IN (${userIds.map(() => '?').join(',')})
    GROUP BY user_id`).all(category, since, ...userIds);
  for (const r of rows) out.set(r.user_id, r.d);
  return out;
}

/** Each user's earliest-joined confirmed club. @returns {Map<string, {slug:string, name:string}>} */
function getPrimaryClubs(userIds) {
  const out = new Map();
  if (!userIds.length) return out;
  const rows = db.prepare(`
    SELECT m.user_id, c.slug, c.name FROM club_members m JOIN clubs c ON c.id = m.club_id
    WHERE m.role != 'pending' AND m.user_id IN (${userIds.map(() => '?').join(',')})
    ORDER BY m.joined_at, c.slug`).all(...userIds);
  for (const r of rows) if (!out.has(r.user_id)) out.set(r.user_id, { slug: r.slug, name: r.name });
  return out;
}

/**
 * Leaderboard rows whose username or display name contains q — each keeps its
 * TRUE global rank (window function), so searching doesn't renumber players.
 */
function searchRankings(category, q, limit, offset) {
  return db.prepare(`
    SELECT * FROM (
      SELECT r.user_id, u.username, u.display_name, u.avatar_v, r.rating, r.rd, r.games,
             ROW_NUMBER() OVER (ORDER BY r.rating DESC, r.user_id) AS rank
      FROM ratings r JOIN users u ON u.id = r.user_id
      WHERE r.category = ? AND r.games >= ?
    ) WHERE username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\'
    ORDER BY rank LIMIT ? OFFSET ?`)
    .all(category, RANKING_MIN_GAMES, likeEscape(q), likeEscape(q), limit, offset);
}

function countSearchRankings(category, q) {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM ratings r JOIN users u ON u.id = r.user_id
    WHERE r.category = ? AND r.games >= ? AND (u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')`)
    .get(category, RANKING_MIN_GAMES, likeEscape(q), likeEscape(q)).n;
}

/**
 * A user's rating after each game over the last `days` days, oldest first,
 * thinned to ≤ maxPoints, plus the all-time peak. The first point is the rating
 * *before* the first game in the window so a one-game history still draws a line.
 */
function getRatingSeries(userId, category, days, maxPoints = 120) {
  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const rows = db.prepare(`
    SELECT created_at AS t, rating_before AS b, rating_after AS a FROM rating_history
    WHERE user_id = ? AND category = ? AND created_at >= ? ORDER BY id`).all(userId, category, since);
  let points = rows.length ? [{ t: rows[0].t, rating: Math.round(rows[0].b) }, ...rows.map((r) => ({ t: r.t, rating: Math.round(r.a) }))] : [];
  if (points.length > maxPoints) {
    const step = (points.length - 1) / (maxPoints - 1);
    points = Array.from({ length: maxPoints }, (_, i) => points[Math.round(i * step)]);
  }
  const peak = db.prepare('SELECT MAX(rating_after) AS m FROM rating_history WHERE user_id = ? AND category = ?').get(userId, category).m;
  return { points, peak: peak == null ? null : Math.round(peak) };
}

module.exports = { RANKING_MIN_GAMES, getRankings, getRankingCount, getRankingsAmong, getRankingsByCountry, getRankingsInMyClubs, countRankingsInMyClubs, countRankingsByCountry, countRankingsAmong, getUserRanking, getRatingDeltas7, getPrimaryClubs, searchRankings, countSearchRankings, getRatingSeries, getRatedGames, lastEloSwapAt };
