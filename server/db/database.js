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

// CREATE TABLE IF NOT EXISTS never adds a column to an already-existing
// table, so a db file created before TODO.md #50 (pairing.games) is missing
// this column — add it in place if so. Additive-only (nullable, no data
// touched), safe to run every startup.
const pairingColumns = db.prepare("PRAGMA table_info(tournament_pairings)").all().map((c) => c.name);
if (pairingColumns.length > 0 && !pairingColumns.includes('games')) {
  db.exec('ALTER TABLE tournament_pairings ADD COLUMN games TEXT');
  logger.info('[DB] Migrated tournament_pairings: added games column (TODO.md #50)');
}

// Same additive-migration need as above, for the 'cancelled' tournament
// status (TODO.md #59) — a db file created before this feature is missing
// these two columns.
const tournamentColumns = db.prepare("PRAGMA table_info(tournaments)").all().map((c) => c.name);
if (tournamentColumns.length > 0 && !tournamentColumns.includes('cancelled_at')) {
  db.exec('ALTER TABLE tournaments ADD COLUMN cancelled_at TEXT');
  db.exec('ALTER TABLE tournaments ADD COLUMN cancel_reason TEXT');
  logger.info('[DB] Migrated tournaments: added cancelled_at/cancel_reason columns (TODO.md #59)');
}

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
// Session helpers (TODO.md #68 — server-side sessions)
//
// These are the persistence half of managers/SessionManager.js; all policy
// (id generation, expiry/revocation checks) lives there, not here. Nothing in
// this section validates a session — getSessionById returns the raw row,
// including expired and revoked ones, precisely so the caller can tell those
// two cases apart from "no such session".
// ---------------------------------------------------------------------------

/**
 * Insert a new session row.
 * @param {{ id, userId, displayName, isGuest, createdAt, expiresAt }} session
 */
function createSession({ id, userId, displayName, isGuest, createdAt, expiresAt }) {
  return db.prepare(
    `INSERT INTO sessions (id, user_id, display_name, is_guest, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId || null, displayName, isGuest ? 1 : 0, createdAt, createdAt, expiresAt);
}

/**
 * Fetch a session row by id — raw, WITHOUT any expiry/revocation filtering.
 * @returns {{ id, user_id, display_name, is_guest, created_at, last_seen_at, expires_at, revoked_at } | undefined}
 */
function getSessionById(id) {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

/**
 * Mark one session revoked. Idempotent: an already-revoked session keeps its
 * ORIGINAL revoked_at, so re-revoking never rewrites when it first happened.
 */
function revokeSession(id, revokedAt) {
  return db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .run(revokedAt, id);
}

/**
 * Revoke every live session belonging to one user. This is what makes
 * session:kicked an actual eviction rather than a disconnect, and what a
 * future "log out everywhere" / "password changed" flow would call.
 *
 * Guests are excluded by construction: their user_id is null, and `= ?` never
 * matches null in SQL — so this can never mass-revoke unrelated guests.
 *
 * @param {string} [exceptId] session to spare (the one just created)
 */
function revokeSessionsForUser(userId, revokedAt, exceptId) {
  if (!userId) return { changes: 0 };
  return exceptId
    ? db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL')
      .run(revokedAt, userId, exceptId)
    : db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(revokedAt, userId);
}

/** Refresh last_seen_at (observability only — never affects validity). */
function touchSession(id, seenAt) {
  return db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(seenAt, id);
}

/**
 * Delete sessions that expired before `before`. Revoked-but-unexpired rows are
 * deliberately KEPT until their natural expiry — deleting a revoked session
 * early would make its id look merely "unknown" again, which is the same
 * outcome but loses the audit trail of why it stopped working.
 */
function deleteExpiredSessions(before) {
  return db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(before);
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
  const { winner, black_player_id, white_player_id, black_player_name, white_player_name } = row;
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
    clauses.push('(black_player_name LIKE ? OR white_player_name LIKE ?)');
    const like = `%${filters.player}%`;
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
    clauses.push("winner = 'draw'");
  } else if (filters.result === 'win') {
    clauses.push("winner IS NOT NULL AND winner != 'draw'");
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
           winner, reason, board_size, rule_wall, rule_portal,
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
           winner, reason, board_size, rule_wall, rule_portal,
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
      SUM(CASE WHEN winner = 'draw' THEN 1 ELSE 0 END) as draw,
      SUM(CASE WHEN winner IS NOT NULL AND winner != 'draw' THEN 1 ELSE 0 END) as win,
      COUNT(*) as total
    FROM games
    ${where}
  `).get(...params);
  return { win: row.win || 0, draw: row.draw || 0, total: row.total || 0 };
}

// ---------------------------------------------------------------------------
// Tournament helpers (features/tournament/, TODO.md #48)
//
// Unlike rooms/games, tournament rows are written at every state transition,
// not just on completion — see the header comment in schema.sql for why.
// ---------------------------------------------------------------------------

/**
 * Insert a new tournament (status 'draft').
 * @param {{ id, name, format, organizerId, ruleSet, createdAt }} tournament
 */
function createTournament({ id, name, format, organizerId, ruleSet, createdAt }) {
  const stmt = db.prepare(
    `INSERT INTO tournaments (id, name, format, organizer_id, rule_set, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?)`
  );
  return stmt.run(id, name, format, organizerId, JSON.stringify(ruleSet), createdAt);
}

/**
 * Look up a tournament by ID. `rule_set` is parsed back into an object.
 * @param {string} id
 * @returns {object|undefined}
 */
function getTournamentById(id) {
  const row = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
  if (row) row.rule_set = JSON.parse(row.rule_set);
  return row;
}

/**
 * Update a tournament's status, and started_at/completed_at/cancelled_at when relevant.
 * @param {string} id
 * @param {'draft'|'active'|'completed'|'cancelled'} status
 * @param {{ startedAt?: string, completedAt?: string, cancelledAt?: string, cancelReason?: string|null }} [timestamps]
 */
function updateTournamentStatus(id, status, timestamps = {}) {
  if (status === 'active') {
    db.prepare('UPDATE tournaments SET status = ?, started_at = ? WHERE id = ?')
      .run(status, timestamps.startedAt, id);
  } else if (status === 'completed') {
    db.prepare('UPDATE tournaments SET status = ?, completed_at = ? WHERE id = ?')
      .run(status, timestamps.completedAt, id);
  } else if (status === 'cancelled') {
    db.prepare('UPDATE tournaments SET status = ?, cancelled_at = ?, cancel_reason = ? WHERE id = ?')
      .run(status, timestamps.cancelledAt, timestamps.cancelReason || null, id);
  } else {
    db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run(status, id);
  }
}

/**
 * Insert a tournament player entry (guest-tolerant — playerId may be null).
 * @param {{ entryId, tournamentId, playerId, displayName, registeredAt }} entry
 */
function saveTournamentPlayer({ entryId, tournamentId, playerId, displayName, registeredAt }) {
  const stmt = db.prepare(
    `INSERT INTO tournament_players (entry_id, tournament_id, player_id, display_name, registered_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  return stmt.run(entryId, tournamentId, playerId || null, displayName, registeredAt);
}

/**
 * Remove a tournament player entry (unregister while still 'draft').
 * @param {string} entryId
 */
function deleteTournamentPlayer(entryId) {
  db.prepare('DELETE FROM tournament_players WHERE entry_id = ?').run(entryId);
}

/**
 * List all player entries for a tournament.
 * @param {string} tournamentId
 * @returns {Array}
 */
function getTournamentPlayers(tournamentId) {
  return db.prepare('SELECT * FROM tournament_players WHERE tournament_id = ?').all(tournamentId);
}

/**
 * Insert a tournament round (created once, at round-generation time).
 * @param {{ id, tournamentId, roundIndex, bracketSide }} round
 */
function createTournamentRound({ id, tournamentId, roundIndex, bracketSide }) {
  db.prepare(
    `INSERT INTO tournament_rounds (id, tournament_id, round_index, bracket_side)
     VALUES (?, ?, ?, ?)`
  ).run(id, tournamentId, roundIndex, bracketSide || null);
}

/**
 * Upsert a pairing row — called at creation and again on every lifecycle
 * transition (unlike casual rooms, pairing history is persisted throughout,
 * not just on completion; see schema.sql's header comment for why).
 * @param {object} pairing — a PairingLifecycle pairing object
 */
function savePairing(pairing) {
  db.prepare(`
    INSERT INTO tournament_pairings
      (id, round_id, tournament_id, player1_entry_id, player2_entry_id, state,
       agreed_time, deadline, paired_at, result, games, moves, started_at, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      state = excluded.state,
      agreed_time = excluded.agreed_time,
      deadline = excluded.deadline,
      result = excluded.result,
      games = excluded.games,
      moves = excluded.moves,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at
  `).run(
    pairing.pairingId,
    pairing.roundId,
    pairing.tournamentId,
    pairing.player1EntryId,
    pairing.player2EntryId,
    pairing.state,
    pairing.agreedTime,
    pairing.deadline,
    pairing.pairedAt,
    pairing.result ? JSON.stringify(pairing.result) : null,
    pairing.games ? JSON.stringify(pairing.games) : null,
    pairing.moves ? JSON.stringify(pairing.moves) : null,
    pairing.startedAt,
    pairing.endedAt
  );
}

/**
 * List all pairings for a tournament, most recently paired first.
 * @param {string} tournamentId
 * @returns {Array}
 */
function getPairingsByTournament(tournamentId) {
  const rows = db.prepare('SELECT * FROM tournament_pairings WHERE tournament_id = ? ORDER BY paired_at DESC').all(tournamentId);
  return rows.map((row) => {
    if (row.result) row.result = JSON.parse(row.result);
    if (row.games) row.games = JSON.parse(row.games);
    if (row.moves) row.moves = JSON.parse(row.moves);
    return row;
  });
}

module.exports = {
  db,
  createUser,
  getUserByUsername,
  getUserById,
  updateLastLogin,
  createSession,
  getSessionById,
  revokeSession,
  revokeSessionsForUser,
  touchSession,
  deleteExpiredSessions,
  saveGame,
  getPlayerHistory,
  getRecentGames,
  getGameById,
  getGameCount,
  getGameStatsByDate,
  getGameStatsByResult,
  createTournament,
  getTournamentById,
  updateTournamentStatus,
  saveTournamentPlayer,
  deleteTournamentPlayer,
  getTournamentPlayers,
  createTournamentRound,
  savePairing,
  getPairingsByTournament,
};
