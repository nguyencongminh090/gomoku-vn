'use strict';

/** db/tournaments.js — split out of database.js (#258); code moved verbatim. */

const logger = require('../utils/logger');
const { db } = require('./connection');
const { withWinnerName } = require('./games');


// ---------------------------------------------------------------------------
// Tournament helpers (features/tournament/, TODO.md #48)
//
// Unlike rooms/games, tournament rows are written at every state transition,
// not just on completion — see the header comment in schema.sql for why.
// ---------------------------------------------------------------------------

/**
 * Insert a new tournament (status 'draft'). `organizerName` is stored even
 * for a guest organizer (only `organizer_id` stays null for guests, since
 * that column is an FK into `users`) — it's needed to render the tournament
 * after a reload, when there's no live `organizerInfo` to fall back on.
 * @param {{ id, name, format, organizerId, organizerName, ruleSet, createdAt }} tournament
 */
function createTournament({ id, name, format, organizerId, organizerName, ruleSet, createdAt, clubId = null }) {
  const stmt = db.prepare(
    `INSERT INTO tournaments (id, name, format, organizer_id, organizer_name, rule_set, status, created_at, club_id)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
  );
  return stmt.run(id, name, format, organizerId, organizerName, JSON.stringify(ruleSet), createdAt, clubId);
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
 * List every tournament, any status — the read half of the reload path
 * (TODO.md #77). `rule_set` is parsed back into an object per row, same as
 * getTournamentById.
 * @returns {Array<object>}
 */
function getAllTournaments() {
  const rows = db.prepare('SELECT * FROM tournaments').all();
  for (const row of rows) row.rule_set = JSON.parse(row.rule_set);
  return rows;
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
 * @param {{ entryId, tournamentId, playerId, guestId, displayName, registeredAt }} entry
 */
function saveTournamentPlayer({ entryId, tournamentId, playerId, guestId, displayName, registeredAt }) {
  const stmt = db.prepare(
    `INSERT INTO tournament_players (entry_id, tournament_id, player_id, guest_id, display_name, registered_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  return stmt.run(entryId, tournamentId, playerId || null, guestId || null, displayName, registeredAt);
}

/**
 * Remove a tournament player entry (unregister while still 'draft').
 * @param {string} entryId
 */
function deleteTournamentPlayer(entryId) {
  db.prepare('DELETE FROM tournament_players WHERE entry_id = ?').run(entryId);
}

/**
 * List all player entries for a tournament, in registration order — the
 * reload path (TODO.md #77) depends on this order to regenerate round-robin/
 * double-elim schedules deterministically (both are seeded off entry array
 * order). Once started, persisted seeds (#242) win over registration order;
 * rowid breaks same-millisecond registration ties for unseeded rows.
 * @param {string} tournamentId
 * @returns {Array}
 */
function getTournamentPlayers(tournamentId) {
  return db.prepare('SELECT * FROM tournament_players WHERE tournament_id = ? ORDER BY seed IS NULL, seed ASC, registered_at ASC, rowid ASC').all(tournamentId);
}

/**
 * Mark an entry withdrawn/dropped (B241).
 * @param {string} entryId
 */
function setTournamentPlayerWithdrawn(entryId) {
  db.prepare('UPDATE tournament_players SET withdrawn = 1 WHERE entry_id = ?').run(entryId);
}

/**
 * Persist an entry's final standing once a tournament completes
 * (TournamentManager._completeTournament/_assignDoubleElimFinalRanks) —
 * previously in-memory only, needed now so it survives a reload (TODO.md #77).
 * @param {string} entryId
 * @param {number} finalRank
 */
function updateTournamentPlayerRank(entryId, finalRank) {
  db.prepare('UPDATE tournament_players SET final_rank = ? WHERE entry_id = ?').run(finalRank, entryId);
}

/**
 * Persist an entry's bracket/pairing seed, assigned once at start (#242).
 * @param {string} entryId
 * @param {number} seed
 */
function updateTournamentPlayerSeed(entryId, seed) {
  db.prepare('UPDATE tournament_players SET seed = ? WHERE entry_id = ?').run(seed, entryId);
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
 * List every round row for a tournament — the reload path (TODO.md #77)
 * joins this against pairings' round_id to recover each pairing's
 * roundIndex (Swiss/round-robin) and to find double-elim's single synthetic
 * round row.
 * @param {string} tournamentId
 * @returns {Array<{id, tournament_id, round_index, bracket_side}>}
 */
function getTournamentRounds(tournamentId) {
  return db.prepare('SELECT * FROM tournament_rounds WHERE tournament_id = ?').all(tournamentId);
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
       agreed_time, deadline, paired_at, result, games, started_at, ended_at, noshow_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      state = excluded.state,
      agreed_time = excluded.agreed_time,
      deadline = excluded.deadline,
      result = excluded.result,
      games = excluded.games,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      noshow_count = excluded.noshow_count
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
    pairing.startedAt,
    pairing.endedAt,
    pairing.noShowCount || 0
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
    return row;
  });
}

/**
 * Persist one INDIVIDUAL finished tournament game (TODO.md #78) — called once
 * per game from TournamentMatchHandler._endMatch, not once per pairing, so a
 * multi-game series gets one row per game. This table owns per-game replay data;
 * the pairing row keeps only the series summary (B345). Mirrors saveGame()'s exact winner-normalization
 * logic, keyed to a tournament entry instead of a raw user id.
 *
 * @param {{ gameId, tournamentId, pairingId, gameIndex,
 *   players: Array<{id, name, color, isGuest, entryId}>, result: {winner, reason}|null,
 *   boardSize, ruleWall, rulePortal, moveHistory, walls, portals, startedAt, endedAt }} game
 */
function saveTournamentGame({
  gameId, tournamentId, pairingId, gameIndex, players, result,
  boardSize, ruleWall, rulePortal, moveHistory, walls, portals, startedAt, endedAt,
}) {
  const black = players.find((p) => p.color === 'BLACK');
  const white = players.find((p) => p.color === 'WHITE');

  let winner = null;
  if (result) {
    if (result.winner === 'draw') winner = 'draw';
    else if (black && result.winner === black.id) winner = 'BLACK';
    else if (white && result.winner === white.id) winner = 'WHITE';
    else winner = result.winner;
  }

  db.prepare(`
    INSERT INTO tournament_games
      (id, tournament_id, pairing_id, game_index, black_entry_id, white_entry_id,
       black_player_name, white_player_name, winner, reason, board_size,
       rule_wall, rule_portal, moves, walls, portals, started_at, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    gameId,
    tournamentId,
    pairingId,
    gameIndex,
    black ? black.entryId : null,
    white ? white.entryId : null,
    black ? black.name : 'Unknown',
    white ? white.name : 'Unknown',
    winner,
    result ? result.reason : null,
    boardSize,
    ruleWall ? 1 : 0,
    rulePortal ? 1 : 0,
    JSON.stringify(moveHistory),
    JSON.stringify(walls),
    JSON.stringify(portals),
    startedAt,
    endedAt
  );
  logger.info(`[DB] Tournament game ${gameId} saved (pairing ${pairingId}, game ${gameIndex}).`);
}

/**
 * List every individual game played in a tournament, chronologically —
 * lightweight (no moves/walls/portals), for the tournament detail page's
 * Games History tab.
 * @param {string} tournamentId
 * @param {number|null} [limit] - page size; null (default) returns every row unpaginated
 * @param {number} [offset]
 * @returns {Array}
 */
function getTournamentGames(tournamentId, limit = null, offset = 0) {
  if (limit == null) {
    return db.prepare(`
      SELECT id, tournament_id, pairing_id, game_index, black_entry_id, white_entry_id,
             black_player_name, white_player_name, winner, reason, board_size,
             rule_wall, rule_portal, started_at, ended_at
      FROM tournament_games
      WHERE tournament_id = ?
      ORDER BY started_at ASC
    `).all(tournamentId);
  }
  return db.prepare(`
    SELECT id, tournament_id, pairing_id, game_index, black_entry_id, white_entry_id,
           black_player_name, white_player_name, winner, reason, board_size,
           rule_wall, rule_portal, started_at, ended_at
    FROM tournament_games
    WHERE tournament_id = ?
    ORDER BY started_at ASC
    LIMIT ? OFFSET ?
  `).all(tournamentId, limit, offset);
}

/**
 * Count a tournament's games, for the Games History tab's pagination.
 * @param {string} tournamentId
 * @returns {number}
 */
function getTournamentGameCount(tournamentId) {
  return db.prepare('SELECT COUNT(*) as count FROM tournament_games WHERE tournament_id = ?')
    .get(tournamentId).count;
}

/**
 * Fetch a single tournament game with full replay data (moves/walls/portals)
 * — same response shape as getGameById(), so the client's existing replay
 * viewer (history.js) needs no rendering changes to consume it.
 * @param {string} id
 * @returns {object|undefined}
 */
function getTournamentGameById(id) {
  const row = db.prepare('SELECT * FROM tournament_games WHERE id = ?').get(id);
  if (!row) return row;
  row.moves = row.moves ? JSON.parse(row.moves) : [];
  row.walls = row.walls ? JSON.parse(row.walls) : [];
  row.portals = row.portals ? JSON.parse(row.portals) : [];
  // Same derived field withWinnerName() adds for casual games — the client's
  // existing replay viewer (history.js's getResultTextFull) reads
  // `winner_name` directly, so this keeps that code path unchanged for a
  // tournament-sourced replay too.
  row.winner_name = row.winner === 'BLACK' ? row.black_player_name
    : row.winner === 'WHITE' ? row.white_player_name
    : null;
  return row;
}

module.exports = { createTournament, getTournamentById, getAllTournaments, updateTournamentStatus, saveTournamentPlayer, deleteTournamentPlayer, getTournamentPlayers, updateTournamentPlayerRank, setTournamentPlayerWithdrawn, updateTournamentPlayerSeed, createTournamentRound, getTournamentRounds, savePairing, getPairingsByTournament, saveTournamentGame, getTournamentGames, getTournamentGameCount, getTournamentGameById };
