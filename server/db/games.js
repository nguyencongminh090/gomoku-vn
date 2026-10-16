'use strict';

/** db/games.js — split out of database.js (#258); code moved verbatim. */

const logger = require('../utils/logger');
const { db } = require('./connection');
const { likeEscape } = require('./like');


// ---------------------------------------------------------------------------
// Game helpers
// ---------------------------------------------------------------------------

/** 'BLACK'|'WHITE'|'draw'|other → 'BLACK'|'WHITE'|'DRAW'|null (raw/unresolvable ids can't satisfy the CHECK). */
function toWinnerColor(winner) {
  if (winner === 'BLACK' || winner === 'WHITE') return winner;
  return winner === 'draw' ? 'DRAW' : null;
}

/**
 * Persist a completed game record to SQLite.
 * Called ONLY when a game ends (normal/resign/timeout/draw).
 *
 * @param {object} game  — full game state object from GameEngine
 */
function saveGame(game) {
  const insertGame = db.prepare(`
    INSERT OR REPLACE INTO games
      (id, room_id, black_player_id, white_player_id,
       black_player_name, white_player_name,
       winner, winner_color, reason, board_size, rule_wall, rule_portal,
       moves, walls, portals, started_at, ended_at, ranked)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPlayerGame = db.prepare(
    'INSERT OR IGNORE INTO player_games (player_id, game_id) VALUES (?, ?)'
  );

  const black = game.players.find(p => p.color === 'BLACK');
  const white = game.players.find(p => p.color === 'WHITE');

  // Store winner as seat color ('BLACK'/'WHITE'/'draw') rather than the raw
  // player id — guest ids have no matching black_player_id/white_player_id
  // column (those are null for guests), so a raw-id winner can never be
  // resolved back to a display name at read time. Color is always resolvable
  // via black_player_name/white_player_name, guest or not.
  let winner = null;
  if (game.result) {
    if (game.result.winner === 'draw') winner = 'draw';
    else if (black && game.result.winner === black.id) winner = 'BLACK';
    else if (white && game.result.winner === white.id) winner = 'WHITE';
    else winner = game.result.winner;
  }

  const winnerColor = toWinnerColor(winner);

  // Wrap in a transaction for atomicity
  const saveAll = db.transaction(() => {
    insertGame.run(
      game.gameId,
      game.roomId,
      (!black || black.isGuest) ? null : black.id,
      (!white || white.isGuest) ? null : white.id,
      black ? black.name : 'Unknown',
      white ? white.name : 'Unknown',
      winner,
      winnerColor,
      game.result ? game.result.reason : null,
      game.boardSize,
      game.ruleWall  ? 1 : 0,
      game.rulePortal ? 1 : 0,
      JSON.stringify(game.moveHistory),
      JSON.stringify(game.walls),
      JSON.stringify(game.portals),
      game.startedAt,
      game.endedAt,
      game.ranked ? 1 : 0
    );

    // Link registered players to game for history lookup
    for (const p of game.players) {
      if (!p.isGuest && p.id) {
        insertPlayerGame.run(p.id, game.gameId);
      }
    }
  });

  saveAll();
  logger.info(`[DB] Game ${game.gameId} saved.`);
}

/**
 * Fetch full game history for a registered player.
 * @param {string} playerId
 * @returns {Array}
 */
function getPlayerHistory(playerId) {
  return db.prepare(`
    SELECT g.* FROM games g
    INNER JOIN player_games pg ON pg.game_id = g.id
    WHERE pg.player_id = ?
    ORDER BY g.started_at DESC
    LIMIT 100
  `).all(playerId);
}

/**
 * Resolve which seat won from a game row that still has
 * black_player_id/white_player_id on it (before those are stripped for the
 * public response — see getRecentGames/getGameById below).
 *
 * saveGame() normalizes `winner` to 'BLACK'/'WHITE'/'draw' for every game it
 * writes, so the id/name-matching and elimination branches below only exist
 * to resolve rows written before that normalization shipped, where `winner`
 * is a raw player id (or, on older data still, a raw name).
 *
 * @param {object} row — must have winner, black_player_id, white_player_id,
 *   black_player_name, white_player_name
 * @returns {'BLACK'|'WHITE'|null} null when the seat can't be determined
 *   (both seats are guests on old data — no id to eliminate by)
 */
function resolveWinnerSeat(row) {
  const { winner, winner_color, black_player_id, white_player_id, black_player_name, white_player_name } = row;
  if (winner_color) return winner_color === 'DRAW' ? null : winner_color;
  if (!winner || winner === 'draw') return null;
  if (winner === 'BLACK') return 'BLACK';
  if (winner === 'WHITE') return 'WHITE';
  // Legacy: winner stored as raw player id.
  if (winner === black_player_id) return 'BLACK';
  if (winner === white_player_id) return 'WHITE';
  // Legacy: winner stored as a raw name directly.
  if (winner === black_player_name) return 'BLACK';
  if (winner === white_player_name) return 'WHITE';
  // Legacy guest winner: guest seats have no stored player id, so a guest's
  // raw id never matches black_player_id/white_player_id above. Infer by
  // elimination — if exactly one seat is a guest (null id), that seat won.
  if (black_player_id == null && white_player_id != null) return 'BLACK';
  if (white_player_id == null && black_player_id != null) return 'WHITE';
  return null;
}

/**
 * Attach `winner_name` to a game row, normalize `winner` to a seat color
 * wherever it can be resolved, then strip black_player_id/white_player_id —
 * those are internal user ids, needed here only to resolve legacy winner
 * data, and must not leave the server.
 *
 * Normalizing `winner` matters, not just `winner_name`: on legacy rows where
 * `winner` was stored as the raw winning player's id, that id is itself the
 * same secret black_player_id/white_player_id is being stripped to protect —
 * leaving it in `winner` would defeat the point.
 *
 * @param {object} row
 * @returns {object} the same row, mutated
 */
function withWinnerName(row) {
  const seat = resolveWinnerSeat(row);
  row.winner_name = seat === 'BLACK' ? row.black_player_name
    : seat === 'WHITE' ? row.white_player_name
    : null;
  if (seat) row.winner = seat;
  delete row.winner_color;
  delete row.black_player_id;
  delete row.white_player_id;
  return row;
}

/**
 * Build a `WHERE` clause + bound params for the games list/stats filters
 * shared by getRecentGames / getGameCount / getGameStatsByDate /
 * getGameStatsByResult, so all four stay consistent with each other.
 *
 * @param {{player?: string, from?: string, to?: string, result?: 'win'|'draw'}} filters
 * @param {string[]} [extraClauses] — additional raw SQL clauses ANDed in (e.g. NULL guards for stats)
 * @returns {{ where: string, params: Array }}
 */
function buildGameFilters(filters = {}, extraClauses = []) {
  const clauses = [...extraClauses];
  const params = [];

  if (filters.player) {
    clauses.push("(black_player_name LIKE ? ESCAPE '\\' OR white_player_name LIKE ? ESCAPE '\\')");
    const like = likeEscape(filters.player);
    params.push(like, like);
  }
  if (filters.from) {
    clauses.push('ended_at >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push('ended_at <= ?');
    params.push(filters.to);
  }
  if (filters.result === 'draw') {
    clauses.push("winner_color = 'DRAW'");
  } else if (filters.result === 'win') {
    clauses.push("winner_color IN ('BLACK','WHITE')");
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

/**
 * Fetch recent games (all players), paginated, optionally filtered.
 * @param {number} limit
 * @param {number} offset
 * @param {{player?: string, from?: string, to?: string, result?: 'win'|'draw'}} [filters]
 * @returns {Array}
 */
function getRecentGames(limit = 20, offset = 0, filters = {}) {
  const { where, params } = buildGameFilters(filters);
  const rows = db.prepare(`
    SELECT id, room_id, black_player_id, white_player_id,
           black_player_name, white_player_name,
           winner, winner_color, reason, board_size, rule_wall, rule_portal,
           started_at, ended_at
    FROM games
    ${where}
    ORDER BY ended_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  return rows.map(withWinnerName);
}

/**
 * Fetch a single game by ID with full move data.
 *
 * Columns are listed explicitly rather than `SELECT *` so that adding a column
 * to the table never silently widens this endpoint's public response.
 * `black_player_id` / `white_player_id` are selected (needed to resolve a
 * legacy winner via `withWinnerName`) but stripped before the row is
 * returned — `/api/games/:id` is unauthenticated, and those are internal
 * user ids.
 *
 * @param {string} gameId
 * @returns {object|undefined}
 */
function getGameById(gameId) {
  const row = db.prepare(`
    SELECT id, room_id, black_player_id, white_player_id,
           black_player_name, white_player_name,
           winner, winner_color, reason, board_size, rule_wall, rule_portal,
           moves, walls, portals,
           started_at, ended_at
    FROM games WHERE id = ?
  `).get(gameId);
  return row && withWinnerName(row);
}

/**
 * Count total games, optionally filtered.
 * @param {{player?: string, from?: string, to?: string, result?: 'win'|'draw'}} [filters]
 * @returns {number}
 */
function getGameCount(filters = {}) {
  const { where, params } = buildGameFilters(filters);
  return db.prepare(`SELECT COUNT(*) as count FROM games ${where}`).get(...params).count;
}

/**
 * Count finished games grouped by day (ended_at's date part), optionally filtered.
 * Interrupted games (no ended_at) are excluded — there's no date to group them by.
 * @param {{player?: string, from?: string, to?: string, result?: 'win'|'draw'}} [filters]
 * @returns {Array<{date: string, count: number}>}
 */
function getGameStatsByDate(filters = {}) {
  const { where, params } = buildGameFilters(filters, ['ended_at IS NOT NULL']);
  return db.prepare(`
    SELECT substr(ended_at, 1, 10) as date, COUNT(*) as count
    FROM games
    ${where}
    GROUP BY date
    ORDER BY date DESC
  `).all(...params);
}

/**
 * Count finished games by result (win vs. draw), optionally filtered.
 * @param {{player?: string, from?: string, to?: string, result?: 'win'|'draw'}} [filters]
 * @returns {{ win: number, draw: number, total: number }}
 */
function getGameStatsByResult(filters = {}) {
  const { where, params } = buildGameFilters(filters, ['ended_at IS NOT NULL']);
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN winner_color = 'DRAW' THEN 1 ELSE 0 END) as draw,
      SUM(CASE WHEN winner_color IN ('BLACK','WHITE') THEN 1 ELSE 0 END) as win,
      COUNT(*) as total
    FROM games
    ${where}
  `).get(...params);
  return { win: row.win || 0, draw: row.draw || 0, total: row.total || 0 };
}

module.exports = { saveGame, getPlayerHistory, getRecentGames, getGameById, getGameCount, getGameStatsByDate, getGameStatsByResult, withWinnerName };
