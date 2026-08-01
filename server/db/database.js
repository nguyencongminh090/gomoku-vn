'use strict';

/**
 * database.js — SQLite initialization and query helpers.
 *
 * Uses better-sqlite3 (synchronous API) — intentional for simplicity.
 * All writes to DB happen ONLY when a game ends (see RoomManager rule #5).
 *
 * Exports: db instance + typed query helpers.
 */

const path        = require('path');
const fs          = require('fs');
const Database    = require('better-sqlite3');
const logger      = require('../utils/logger');

// DB file lives in server/db/gomoku.db
const DB_PATH     = path.join(__dirname, 'gomoku.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema (idempotent — all statements use IF NOT EXISTS)
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// Periodic WAL checkpoint to prevent unbounded growth
setInterval(() => {
  try {
    db.pragma('wal_checkpoint(PASSIVE)');
  } catch (err) {
    logger.error('[DB] WAL checkpoint failed:', err);
  }
}, 60 * 60 * 1000); // Every hour

logger.info('[DB] SQLite initialized at', DB_PATH);

// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

/**
 * Insert a new user.
 * @param {{ id, username, passwordHash, displayName, createdAt }} user
 */
function createUser({ id, username, passwordHash, displayName, createdAt }) {
  const stmt = db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  return stmt.run(id, username, passwordHash, displayName, createdAt);
}

/**
 * Look up a user by username.
 * @param {string} username
 * @returns {{ id, username, password_hash, display_name, created_at } | undefined}
 */
function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

/**
 * Look up a user by ID.
 * @param {string} id
 * @returns {{ id, username, password_hash, display_name, created_at } | undefined}
 */
function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

/**
 * Stamp a user's last_login_at on successful authentication.
 * @param {string} id
 * @param {string} loggedInAt  ISO 8601 timestamp
 */
function updateLastLogin(id, loggedInAt) {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(loggedInAt, id);
}

// ---------------------------------------------------------------------------
// Game helpers
// ---------------------------------------------------------------------------

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
       winner, reason, board_size, rule_wall, rule_portal,
       moves, walls, portals, started_at, ended_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      game.result ? game.result.reason : null,
      game.boardSize,
      game.ruleWall  ? 1 : 0,
      game.rulePortal ? 1 : 0,
      JSON.stringify(game.moveHistory),
      JSON.stringify(game.walls),
      JSON.stringify(game.portals),
      game.startedAt,
      game.endedAt
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
 * Fetch recent games (all players), paginated.
 * @param {number} limit
 * @param {number} offset
 * @returns {Array}
 */
function getRecentGames(limit = 20, offset = 0) {
  return db.prepare(`
    SELECT id, room_id, black_player_id, white_player_id,
           black_player_name, white_player_name,
           winner, reason, board_size, rule_wall, rule_portal,
           started_at, ended_at
    FROM games
    ORDER BY ended_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

/**
 * Fetch a single game by ID with full move data.
 * @param {string} gameId
 * @returns {object|undefined}
 */
function getGameById(gameId) {
  return db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
}

/**
 * Count total games.
 * @returns {number}
 */
function getGameCount() {
  return db.prepare('SELECT COUNT(*) as count FROM games').get().count;
}

module.exports = {
  db,
  createUser,
  getUserByUsername,
  getUserById,
  updateLastLogin,
  saveGame,
  getPlayerHistory,
  getRecentGames,
  getGameById,
  getGameCount,
};
