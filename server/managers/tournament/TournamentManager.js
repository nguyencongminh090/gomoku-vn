'use strict';

/**
 * TournamentManager.js — Tournament CRUD + player registration.
 *
 * Singleton, mirrors RoomManager.js's shape (see that file's header) but is
 * NOT the same domain model — this is the "separate from casual game
 * sessions" architectural constraint from features/tournament/user_story.md.
 * Nothing here touches RoomManager.rooms/userRoomMap.
 *
 * Unlike rooms (in-memory only), tournaments ARE persisted from creation —
 * see schema.sql's header comment for why. In-memory state here is the live
 * working copy; database.js calls keep SQLite as the durable record of every
 * transition.
 *
 * Tournament structure:
 *   { tournamentId, name, format, organizerId, ruleSet, status,
 *     entries: Map<entryId, entry>, createdAt, startedAt, completedAt }
 * Entry structure:
 *   { entryId, userId (null for guest), displayName, isGuest, seed,
 *     finalRank, withdrawn }
 *
 * Phase 1 scope (docs/instruction/B48-*.md): CRUD + registration only.
 * startTournament() is a stub — round/pairing generation is Phase 3.
 *
 * Manual test checklist:
 *   [ ] createTournament rejects an invalid format
 *   [ ] registerPlayer rejects once status is no longer 'draft'
 *   [ ] a user can be registered in multiple tournaments at once (decision 6)
 *   [ ] unregisterPlayer is idempotent-safe (never-registered → error, not throw)
 */

const { v4: uuidv4 } = require('uuid');
const config = require('../../config');
const logger = require('../../utils/logger');
const database = require('../../db/database');
const EventEmitter = require('events');

class TournamentManager extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, object>} tournamentId → tournament object */
    this.tournaments = new Map();

    /**
     * userId → Set<tournamentId>. A Set, not a single id — decision 6
     * (features/tournament/planning.md) allows unrestricted concurrency: a
     * player may be registered in many tournaments at once, unlike
     * RoomManager's one-room-per-user constraint.
     * @type {Map<string, Set<string>>}
     */
    this.userTournamentMap = new Map();

    logger.info('[TournamentManager] Initialized');
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  /**
   * Create a new tournament. The creator becomes the Organizer.
   *
   * @param {object} organizerInfo — { userId, displayName, isGuest }
   * @param {{ name?: string, format: string, ruleSet?: object }} options
   * @returns {{ tournament: object } | { error: string, code: string }}
   */
  createTournament(organizerInfo, { name, format, ruleSet } = {}) {
    if (!config.TOURNAMENT_FORMATS.includes(format)) {
      return { error: 'Thể thức giải đấu không hợp lệ.', code: 'INVALID_FORMAT' };
    }

    const tournamentId = uuidv4();
    const tournamentName = name ? String(name).slice(0, 60) : `Giải đấu của ${organizerInfo.displayName}`;
    const validatedRuleSet = this._validateRuleSet(ruleSet || {});
    const createdAt = new Date().toISOString();

    const tournament = {
      tournamentId,
      name: tournamentName,
      format,
      organizerId: organizerInfo.userId,
      ruleSet: validatedRuleSet,
      status: 'draft',      // draft | active | completed
      entries: new Map(),   // entryId → entry
      createdAt,
      startedAt: null,
      completedAt: null,
    };

    this.tournaments.set(tournamentId, tournament);

    database.createTournament({
      id: tournamentId,
      name: tournamentName,
      format,
      organizerId: organizerInfo.isGuest ? null : organizerInfo.userId,
      ruleSet: validatedRuleSet,
      createdAt,
    });

    logger.info(`[TournamentManager] Tournament ${tournamentId} (${format}) created by ${organizerInfo.displayName}`);
    return { tournament };
  }

  // ---------------------------------------------------------------------------
  // Register / Unregister
  // ---------------------------------------------------------------------------

  /**
   * Register a player (or the organizer themselves — not forbidden by the
   * user story) into a tournament. Only valid while status is 'draft'.
   *
   * @param {object} userInfo — { userId, displayName, isGuest }
   * @param {string} tournamentId
   * @returns {{ tournament: object, entryId: string } | { error: string, code: string }}
   */
  registerPlayer(userInfo, tournamentId) {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return { error: 'Giải đấu không tồn tại.', code: 'TOURNAMENT_NOT_FOUND' };
    }

    if (tournament.status !== 'draft') {
      return { error: 'Giải đấu đã bắt đầu, không thể đăng ký thêm.', code: 'TOURNAMENT_ALREADY_STARTED' };
    }

    for (const [, entry] of tournament.entries) {
      if (entry.userId === userInfo.userId) {
        return { error: 'Bạn đã đăng ký giải đấu này rồi.', code: 'ALREADY_REGISTERED' };
      }
    }

    const entryId = uuidv4();
    const registeredAt = new Date().toISOString();
    const entry = {
      entryId,
      userId: userInfo.userId,
      displayName: userInfo.displayName,
      isGuest: userInfo.isGuest,
      seed: null,
      finalRank: null,
      withdrawn: false,
    };

    tournament.entries.set(entryId, entry);

    if (!this.userTournamentMap.has(userInfo.userId)) {
      this.userTournamentMap.set(userInfo.userId, new Set());
    }
    this.userTournamentMap.get(userInfo.userId).add(tournamentId);

    database.saveTournamentPlayer({
      entryId,
      tournamentId,
      playerId: userInfo.isGuest ? null : userInfo.userId,
      displayName: userInfo.displayName,
      registeredAt,
    });

    logger.info(`[TournamentManager] ${userInfo.displayName} registered for tournament ${tournamentId}`);
    return { tournament, entryId };
  }

  /**
   * Unregister a player from a tournament. Only valid while status is 'draft'.
   *
   * @param {string} userId
   * @param {string} tournamentId
   * @returns {{ tournament: object } | { error: string, code: string }}
   */
  unregisterPlayer(userId, tournamentId) {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return { error: 'Giải đấu không tồn tại.', code: 'TOURNAMENT_NOT_FOUND' };
    }

    if (tournament.status !== 'draft') {
      return { error: 'Giải đấu đã bắt đầu, không thể huỷ đăng ký.', code: 'TOURNAMENT_ALREADY_STARTED' };
    }

    let foundEntryId = null;
    for (const [entryId, entry] of tournament.entries) {
      if (entry.userId === userId) { foundEntryId = entryId; break; }
    }

    if (!foundEntryId) {
      return { error: 'Bạn chưa đăng ký giải đấu này.', code: 'NOT_REGISTERED' };
    }

    tournament.entries.delete(foundEntryId);
    database.deleteTournamentPlayer(foundEntryId);

    const userTournaments = this.userTournamentMap.get(userId);
    if (userTournaments) {
      userTournaments.delete(tournamentId);
      if (userTournaments.size === 0) this.userTournamentMap.delete(userId);
    }

    logger.info(`[TournamentManager] User ${userId} unregistered from tournament ${tournamentId}`);
    return { tournament };
  }

  // ---------------------------------------------------------------------------
  // Start (Phase 1 stub — real round generation is Phase 3)
  // ---------------------------------------------------------------------------

  /**
   * Organizer starts the tournament. Phase 1: flips status to 'active' only —
   * no pairing/round generation yet (Phase 3 supplies that via the format
   * engines in server/managers/tournament/pairing/).
   *
   * @param {string} organizerId
   * @param {string} tournamentId
   * @returns {{ tournament: object } | { error: string, code: string }}
   */
  startTournament(organizerId, tournamentId) {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return { error: 'Giải đấu không tồn tại.', code: 'TOURNAMENT_NOT_FOUND' };
    }

    if (tournament.organizerId !== organizerId) {
      return { error: 'Chỉ người tổ chức mới có thể bắt đầu giải đấu.', code: 'ORGANIZER_ONLY' };
    }

    if (tournament.status !== 'draft') {
      return { error: 'Giải đấu đã bắt đầu hoặc đã kết thúc.', code: 'TOURNAMENT_ALREADY_STARTED' };
    }

    tournament.status = 'active';
    tournament.startedAt = new Date().toISOString();
    database.updateTournamentStatus(tournamentId, 'active', { startedAt: tournament.startedAt });

    // Phase 3 TODO: generate the first round's pairings here via
    // server/managers/tournament/pairing/{swiss,roundRobin,doubleElim}.js
    // and populate server/socket/tournamentState.js's pendingDeadlines.

    this.emit('tournament_started', tournamentId);
    logger.info(`[TournamentManager] Tournament ${tournamentId} started`);
    return { tournament };
  }

  // ---------------------------------------------------------------------------
  // List / Get
  // ---------------------------------------------------------------------------

  /**
   * Returns a summary array of all tournaments for the lobby display.
   * @returns {Array<object>}
   */
  listTournaments() {
    const list = [];
    for (const [, tournament] of this.tournaments) {
      list.push({
        tournamentId: tournament.tournamentId,
        name: tournament.name,
        format: tournament.format,
        organizerId: tournament.organizerId,
        playerCount: tournament.entries.size,
        status: tournament.status,
      });
    }
    return list;
  }

  /** Get a tournament by ID. */
  getTournament(tournamentId) {
    return this.tournaments.get(tournamentId) || null;
  }

  // ---------------------------------------------------------------------------
  // Serialization helpers (for socket emit — used starting Phase 4)
  // ---------------------------------------------------------------------------

  /** Full snapshot, including ruleSet. */
  serializeTournament(tournament) {
    const entries = [];
    for (const [, e] of tournament.entries) {
      entries.push({
        entryId: e.entryId,
        userId: e.userId,
        displayName: e.displayName,
        isGuest: e.isGuest,
        seed: e.seed,
        finalRank: e.finalRank,
        withdrawn: e.withdrawn,
      });
    }
    return {
      tournamentId: tournament.tournamentId,
      name: tournament.name,
      format: tournament.format,
      organizerId: tournament.organizerId,
      ruleSet: { ...tournament.ruleSet },
      status: tournament.status,
      entries,
      createdAt: tournament.createdAt,
      startedAt: tournament.startedAt,
      completedAt: tournament.completedAt,
    };
  }

  /** Diffed broadcast shape — everything serializeTournament sends except ruleSet. */
  serializeTournamentUpdate(tournament) {
    const payload = this.serializeTournament(tournament);
    delete payload.ruleSet;
    return payload;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Validate and merge a ruleSet with defaults. One shared schema across all
   * 3 formats (decision 4, features/tournament/planning.md) — board/timer
   * fields mirror RoomManager._validateSettings's validation exactly, plus
   * tournament-specific scheduling/tiebreak fields.
   */
  _validateRuleSet(ruleSet) {
    const r = {};

    r.boardSize = config.VALID_BOARD_SIZES.includes(ruleSet.boardSize)
      ? ruleSet.boardSize
      : config.DEFAULT_BOARD_SIZE;

    const VALID_WINNING = ['freestyle', 'standard', 'caro'];
    r.winningRule = VALID_WINNING.includes(ruleSet.winningRule) ? ruleSet.winningRule : 'freestyle';

    r.ruleWall   = ruleSet.ruleWall === true;
    r.rulePortal = ruleSet.rulePortal === true;
    r.ruleSwap2  = ruleSet.ruleSwap2 === true;
    if (r.ruleSwap2) { r.ruleWall = false; r.rulePortal = false; }

    r.timerMode = (ruleSet.timerMode === 'per_move' || ruleSet.timerMode === 'per_game' || ruleSet.timerMode === 'blitz')
      ? ruleSet.timerMode
      : config.DEFAULT_TIMER_MODE;

    r.timerSeconds = (typeof ruleSet.timerSeconds === 'number'
                      && ruleSet.timerSeconds >= 5
                      && ruleSet.timerSeconds <= 3600)
      ? Math.floor(ruleSet.timerSeconds)
      : config.DEFAULT_TIMER_SECONDS;

    r.timerIncrementSeconds = (typeof ruleSet.timerIncrementSeconds === 'number'
                               && ruleSet.timerIncrementSeconds >= 0
                               && ruleSet.timerIncrementSeconds <= 600)
      ? Math.floor(ruleSet.timerIncrementSeconds)
      : config.DEFAULT_TIMER_INCREMENT_SECONDS;

    // Per-match scheduling window (decision 2) — how long a pairing has, from
    // the moment it's announced, before an unresolved state resolves via
    // walkover/void-replay (Phase 3).
    r.schedulingWindowMs = (typeof ruleSet.schedulingWindowMs === 'number' && ruleSet.schedulingWindowMs > 0)
      ? Math.floor(ruleSet.schedulingWindowMs)
      : config.DEFAULT_SCHEDULING_WINDOW_MS;

    // Only one tiebreak method is implemented (decision 9) — validated
    // against a single-value allowlist so an invalid override can't silently
    // request a method Phase 2's standings.js doesn't know how to compute.
    r.tiebreakRule = ruleSet.tiebreakRule === config.DEFAULT_TIEBREAK_RULE
      ? ruleSet.tiebreakRule
      : config.DEFAULT_TIEBREAK_RULE;

    return r;
  }
}

// Export singleton instance — TournamentManager is the single source of truth
module.exports = new TournamentManager();
