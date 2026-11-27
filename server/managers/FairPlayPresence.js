'use strict';

/**
 * FairPlayPresence.js — away / disconnect summary of RATED games for staff review (#496,
 * features/presence-status §4, Q6 A). Read-only posture of RatingIntegrityService: a signal to read, never an
 * automatic penalty — tab focus is spoofable (userscripts) and lost for innocent reasons (split screen, a second
 * window, system dialogs, calls).
 *
 * During a game: counters per player on the engine (`engine.fairPlay`), fed by presence transitions at the table
 * (RoomHandler) and by drops / returns (DisconnectHandler). At game end (GameHandler.handleGameEnd, rated and saved):
 * ONE row per player in `game_presence` (migration 028). No raw event stream. Kept 90 days (hourly prune).
 *
 * Own-turn away time is approximate: an away stretch counts as own-turn from the later of its start and the last
 * move, when the turn is the player's at its end (an away player cannot move, so the turn can only have reached
 * them during it). Good enough for weak evidence; documented in the admin hint.
 *
 * Best-effort everywhere: a failure is logged and never touches the game path.
 */

const database = require('../db/database');
const logger = require('../utils/logger');
const roles = require('../utils/roles');

const db = () => database.db;
const KEEP_MS = 90 * 24 * 60 * 60 * 1000;
const REPORT_MIN_GAMES = 3;
const REPORT_LIMIT = 30;

class FairPlayError extends Error {
  constructor(code, status, message) { super(message); this.name = 'FairPlayError'; this.code = code; this.status = status; }
}

const isRated = (engine) => !!engine && typeof engine.isRated === 'function' && engine.isRated() === true;

function countersOf(engine, uid) {
  if (!isRated(engine) || !engine.players.some((p) => p.userId === uid)) return null;
  if (!engine.fairPlay) engine.fairPlay = { startedAt: Date.now(), players: {} };
  const all = engine.fairPlay.players;
  if (!all[uid]) {
    all[uid] = { disconnects: 0, disconnectMs: 0, awayCount: 0, awayMs: 0, awayOwnTurnMs: 0, longestAwayMs: 0, awaySince: null, discSince: null };
  }
  return all[uid];
}

function lastMoveAt(engine) {
  const h = engine.moveHistory || [];
  return h.length && typeof h[h.length - 1].timestamp === 'number' ? h[h.length - 1].timestamp : 0;
}

function closeAway(engine, uid, c, now) {
  if (c.awaySince === null) return;
  const ms = Math.max(0, now - c.awaySince);
  c.awayMs += ms;
  c.longestAwayMs = Math.max(c.longestAwayMs, ms);
  if (engine.currentTurn === uid) c.awayOwnTurnMs += Math.max(0, now - Math.max(c.awaySince, lastMoveAt(engine)));
  c.awaySince = null;
}

/** The player's table presence changed: 'away' (room page hidden / unfocused / another page) or 'active'. */
function onPresence(engine, uid, presence, now = Date.now()) {
  try {
    if (!engine || engine.status !== 'ongoing') return;
    const c = countersOf(engine, uid);
    if (!c || c.discSince !== null) return;
    if (presence === 'away' && c.awaySince === null) { c.awaySince = now; c.awayCount++; }
    else if (presence !== 'away') closeAway(engine, uid, c, now);
  } catch (err) { logger.warn('[FairPlay] onPresence failed', { err: err.message }); }
}

function onDisconnect(engine, uid, now = Date.now()) {
  try {
    const c = countersOf(engine, uid);
    if (!c || c.discSince !== null) return;
    closeAway(engine, uid, c, now); // the drop takes over from an away stretch
    c.discSince = now;
    c.disconnects++;
  } catch (err) { logger.warn('[FairPlay] onDisconnect failed', { err: err.message }); }
}

function onReturn(engine, uid, now = Date.now()) {
  try {
    const c = countersOf(engine, uid);
    if (!c || c.discSince === null) return;
    c.disconnectMs += Math.max(0, now - c.discSince);
    c.discSince = null;
  } catch (err) { logger.warn('[FairPlay] onReturn failed', { err: err.message }); }
}

/** Game over (rated, saved): close open stretches and write one row per player. */
function write(engine, now = Date.now()) {
  try {
    if (!isRated(engine) || !engine.gameId) return 0;
    const ins = db().prepare(`INSERT OR REPLACE INTO game_presence
      (game_id, user_id, disconnects, disconnect_ms, away_count, away_ms, away_ms_own_turn, longest_away_ms, game_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const startedAt = (engine.fairPlay && engine.fairPlay.startedAt) || (engine.moveHistory && engine.moveHistory[0] && engine.moveHistory[0].timestamp) || now;
    let n = 0;
    for (const p of engine.players) {
      if (p.isGuest) continue;
      const c = countersOf(engine, p.userId);
      if (!c) continue;
      closeAway(engine, p.userId, c, now);
      if (c.discSince !== null) { c.disconnectMs += Math.max(0, now - c.discSince); c.discSince = null; }
      ins.run(engine.gameId, p.userId, c.disconnects, c.disconnectMs, c.awayCount, c.awayMs, c.awayOwnTurnMs, c.longestAwayMs, Math.max(0, now - startedAt), now);
      n++;
    }
    return n;
  } catch (err) {
    logger.warn('[FairPlay] write failed', { err: err.message });
    return 0;
  }
}

function prune(now = Date.now()) {
  try { return db().prepare('DELETE FROM game_presence WHERE created_at < ?').run(now - KEEP_MS).changes; }
  catch (err) { logger.warn('[FairPlay] prune failed', { err: err.message }); return 0; }
}

/**
 * Staff report: players with at least REPORT_MIN_GAMES rated games in the retention window and any signal,
 * most own-turn away time (share of game time) first. Perm rating.integrity (admin only).
 */
function report(staffId) {
  if (!roles.can(staffId, 'rating.integrity')) throw new FairPlayError('CHEAT_FORBIDDEN', 403, 'Bạn không có quyền.');
  const rows = db().prepare(`
    SELECT gp.user_id AS userId, u.display_name AS displayName, COUNT(*) AS games,
           SUM(gp.disconnects) AS disconnects, SUM(gp.disconnect_ms) AS disconnectMs,
           SUM(gp.away_count) AS awayCount, SUM(gp.away_ms) AS awayMs, SUM(gp.away_ms_own_turn) AS awayOwnTurnMs,
           MAX(gp.longest_away_ms) AS longestAwayMs, SUM(gp.game_ms) AS gameMs
    FROM game_presence gp JOIN users u ON u.id = gp.user_id
    GROUP BY gp.user_id
    HAVING COUNT(*) >= ? AND (SUM(gp.disconnects) > 0 OR SUM(gp.away_count) > 0)`).all(REPORT_MIN_GAMES);
  for (const r of rows) r.ownTurnAwayShare = r.gameMs > 0 ? Math.round((1000 * r.awayOwnTurnMs) / r.gameMs) / 1000 : 0;
  rows.sort((a, b) => b.ownTurnAwayShare - a.ownTurnAwayShare || b.disconnects - a.disconnects);
  return { keepDays: KEEP_MS / 86_400_000, minGames: REPORT_MIN_GAMES, players: rows.slice(0, REPORT_LIMIT) };
}

module.exports = { onPresence, onDisconnect, onReturn, write, prune, report, FairPlayError, KEEP_MS, REPORT_MIN_GAMES };
