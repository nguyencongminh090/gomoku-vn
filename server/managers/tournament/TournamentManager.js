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

const PairingLifecycle = require('./PairingLifecycle');
const swissPairing = require('./pairing/swiss');
const roundRobinPairing = require('./pairing/roundRobin');
const doubleElimPairing = require('./pairing/doubleElim');
const standingsModule = require('./standings');
const seriesModule = require('./series');
const tournamentState = require('../../socket/tournamentState');

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

    /** @type {Map<string, object>} pairingId → pairing object (PairingLifecycle shape) */
    this.pairings = new Map();

    // One-directional dependency (tournamentState never requires this
    // module back) — see tournamentState.js's header for why.
    tournamentState.setDeadlineHandler((pairingId, tournamentId) => this._handlePairingDeadline(pairingId, tournamentId));

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
      // In-memory only (no DB column) — same reasoning as RoomManager's
      // hostName: display names aren't part of the durable audit trail,
      // and nothing survives a server restart for this feature yet anyway
      // (Phase 1-4 never added a "reload tournaments from DB" path).
      organizerName: organizerInfo.displayName,
      ruleSet: validatedRuleSet,
      status: 'draft',      // draft | active | completed | cancelled
      entries: new Map(),   // entryId → entry
      createdAt,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelReason: null,
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
      hadBye: false, // Swiss: at most one bye per player across the tournament
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
  // Start
  // ---------------------------------------------------------------------------

  /**
   * Organizer starts the tournament: flips status to 'active' and generates
   * round 1 (or the initial bracket, for double_elim) via the Phase 2 format
   * engines. A tournament with fewer than 2 entries still starts (no
   * pairings are generated — matches the Phase 1 contract that this never
   * throws), it just never has anything to advance.
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

    tournament.completedPairings = []; // for standings.js (Swiss/Round robin)
    const entryIds = Array.from(tournament.entries.keys());

    if (entryIds.length >= 2) {
      if (tournament.format === 'swiss') {
        tournament.currentRoundIndex = 1;
        tournament.totalRounds = tournament.ruleSet.swissRounds
          || Math.max(1, Math.ceil(Math.log2(Math.max(entryIds.length, 2))));
        const standings = entryIds.map((id) => ({ id, score: 0, opponents: new Set(), hadBye: false }));
        const pairingsSpec = swissPairing.generateNextRound(standings);
        this._materializeRound(tournament, pairingsSpec);
      } else if (tournament.format === 'round_robin') {
        tournament.allRounds = roundRobinPairing.generateAllRounds(entryIds);
        tournament.currentRoundIndex = 0;
        this._materializeRound(tournament, tournament.allRounds[0] || []);
      } else if (tournament.format === 'double_elim') {
        tournament.bracket = doubleElimPairing.generateBracket(entryIds);
        tournament.bracketResults = new Map();
        // One synthetic round row for the whole bracket — DE's rounds don't
        // map to discrete tournament_rounds the way Swiss/Round robin's do
        // (bracket matches are created lazily, round-by-round-of-the-tree,
        // not batched per round), but tournament_pairings.round_id is a
        // NOT NULL FK, so this row still has to exist before any pairing
        // referencing it can be inserted.
        tournament.bracketRoundId = uuidv4();
        database.createTournamentRound({
          id: tournament.bracketRoundId,
          tournamentId: tournament.tournamentId,
          roundIndex: 1,
          bracketSide: null,
        });
        this._syncDoubleElimPairings(tournament);
      }
    }

    this.emit('tournament_started', tournamentId);
    logger.info(`[TournamentManager] Tournament ${tournamentId} started`);
    return { tournament };
  }

  /**
   * Organizer-only cancel, reachable from 'draft' or 'active' at any point
   * before natural completion (TODO.md #59) — never from 'completed' (a
   * finished tournament can't retroactively be cancelled) or 'cancelled'
   * itself (one-way terminal action, not a re-entrant no-op).
   *
   * Force-terminates every non-terminal pairing via
   * PairingLifecycle.cancelForTournament (no winner recorded). Partial
   * standings need no extra computation here — tournament-detail.js's
   * standings table is already computed purely from each pairing's own
   * state/result (not from tournament.status), so pairings left `Completed`
   * before the cancel keep counting once the client sees status='cancelled'
   * and labels the table as partial (see instruction.md B59 for why this
   * deviates from the originally-sketched "reuse _completeTournament's
   * standings helper" approach).
   *
   * TournamentManager never touches io (see class header) — an `InProgress`
   * pairing's TimerManager is torn down here (tournamentState, not io), but
   * its actual socket-room teardown/broadcast is the caller's job, using the
   * pairingIds returned in `cancelledLivePairingIds`.
   *
   * @param {string} organizerId
   * @param {string} tournamentId
   * @param {string} [reason] optional freeform note, shown to players/visitors
   * @returns {{ tournament: object, cancelledLivePairingIds: string[] } | { error: string, code: string }}
   */
  cancelTournament(organizerId, tournamentId, reason) {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return { error: 'Giải đấu không tồn tại.', code: 'TOURNAMENT_NOT_FOUND' };
    }
    if (tournament.organizerId !== organizerId) {
      return { error: 'Chỉ người tổ chức mới có thể huỷ giải đấu.', code: 'ORGANIZER_ONLY' };
    }
    if (tournament.status !== 'draft' && tournament.status !== 'active') {
      return { error: 'Giải đấu đã kết thúc hoặc đã bị huỷ.', code: 'TOURNAMENT_NOT_CANCELLABLE' };
    }

    const cancelledLivePairingIds = [];
    for (const pairing of this.listPairings(tournamentId)) {
      if (PairingLifecycle.TERMINAL_STATES.has(pairing.state)) continue;
      if (pairing.state === 'InProgress') {
        this._teardownPairingTimer(pairing.pairingId);
        cancelledLivePairingIds.push(pairing.pairingId);
      }
      tournamentState.untrackDeadline(pairing.pairingId);
      PairingLifecycle.cancelForTournament(pairing, reason);
      this._persistPairing(pairing);
      this._emitPairingChanged(tournamentId, pairing.pairingId);
    }

    tournament.status = 'cancelled';
    tournament.cancelledAt = new Date().toISOString();
    tournament.cancelReason = reason || null;
    database.updateTournamentStatus(tournamentId, 'cancelled', {
      cancelledAt: tournament.cancelledAt,
      cancelReason: tournament.cancelReason,
    });

    this.emit('tournament_cancelled', { tournamentId, cancelledLivePairingIds });
    logger.info(`[TournamentManager] Tournament ${tournamentId} cancelled by ${organizerId}`);
    return { tournament, cancelledLivePairingIds };
  }

  // ---------------------------------------------------------------------------
  // Pairing lifecycle wrappers — resolve userId -> entryId / organizerId,
  // delegate to PairingLifecycle, persist, and handle the tournamentState
  // (deadline tracking, timers) side effects each transition implies.
  // ---------------------------------------------------------------------------

  /** @returns {string|null} */
  _findEntryIdByUserId(tournament, userId) {
    for (const [entryId, entry] of tournament.entries) {
      if (entry.userId === userId) return entryId;
    }
    return null;
  }

  /** Shared lookup + not-found handling for every pairing-action wrapper below. */
  _resolvePairingContext(tournamentId, pairingId) {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return { error: 'Giải đấu không tồn tại.', code: 'TOURNAMENT_NOT_FOUND' };
    const pairing = this.pairings.get(pairingId);
    if (!pairing || pairing.tournamentId !== tournamentId) {
      return { error: 'Cặp đấu không tồn tại.', code: 'PAIRING_NOT_FOUND' };
    }
    return { tournament, pairing };
  }

  getPairing(pairingId) {
    return this.pairings.get(pairingId) || null;
  }

  /** All pairings for a tournament, most recently paired first. */
  listPairings(tournamentId) {
    return Array.from(this.pairings.values())
      .filter((p) => p.tournamentId === tournamentId)
      .sort((a, b) => (a.pairedAt < b.pairedAt ? 1 : -1));
  }

  reportPairingTime(userId, tournamentId, pairingId, proposedTime) {
    const ctx = this._resolvePairingContext(tournamentId, pairingId);
    if (ctx.error) return ctx;
    const entryId = this._findEntryIdByUserId(ctx.tournament, userId);
    if (!entryId) return { error: 'Bạn không tham gia giải đấu này.', code: 'NOT_A_PARTICIPANT' };
    const result = PairingLifecycle.reportTime(ctx.pairing, entryId, proposedTime);
    if (!result.error) { this._persistPairing(ctx.pairing); this._emitPairingChanged(tournamentId, pairingId); }
    return result;
  }

  confirmPairingTime(userId, tournamentId, pairingId) {
    const ctx = this._resolvePairingContext(tournamentId, pairingId);
    if (ctx.error) return ctx;
    const entryId = this._findEntryIdByUserId(ctx.tournament, userId);
    if (!entryId) return { error: 'Bạn không tham gia giải đấu này.', code: 'NOT_A_PARTICIPANT' };
    const result = PairingLifecycle.confirmTime(ctx.pairing, entryId);
    if (!result.error) { this._persistPairing(ctx.pairing); this._emitPairingChanged(tournamentId, pairingId); }
    return result;
  }

  disputePairingTime(userId, tournamentId, pairingId) {
    const ctx = this._resolvePairingContext(tournamentId, pairingId);
    if (ctx.error) return ctx;
    const entryId = this._findEntryIdByUserId(ctx.tournament, userId);
    if (!entryId) return { error: 'Bạn không tham gia giải đấu này.', code: 'NOT_A_PARTICIPANT' };
    const result = PairingLifecycle.disputeTime(ctx.pairing, entryId);
    if (!result.error) { this._persistPairing(ctx.pairing); this._emitPairingChanged(tournamentId, pairingId); }
    return result;
  }

  organizerResolvePairing(userId, tournamentId, pairingId, finalTime) {
    const ctx = this._resolvePairingContext(tournamentId, pairingId);
    if (ctx.error) return ctx;
    const wasOverdue = ctx.pairing.overdue;
    const result = PairingLifecycle.organizerResolve(
      ctx.pairing, userId, ctx.tournament.organizerId, finalTime, ctx.tournament.ruleSet.schedulingWindowMs
    );
    if (result.error) return result;
    this._persistPairing(ctx.pairing);
    if (wasOverdue) {
      tournamentState.trackDeadline(pairingId, tournamentId, new Date(ctx.pairing.deadline).getTime());
    }
    this._emitPairingChanged(tournamentId, pairingId);
    return result;
  }

  organizerAdjustPairing(userId, tournamentId, pairingId, reason) {
    const ctx = this._resolvePairingContext(tournamentId, pairingId);
    if (ctx.error) return ctx;
    const result = PairingLifecycle.organizerAdjust(ctx.pairing, userId, ctx.tournament.organizerId, reason);
    if (result.error) return result;
    this._persistPairing(ctx.pairing);
    tournamentState.untrackDeadline(pairingId);
    this._advanceIfRoundComplete(ctx.tournament);
    this._emitPairingChanged(tournamentId, pairingId);
    return result;
  }

  requestPairingReschedule(userId, tournamentId, pairingId, newProposedTime) {
    const ctx = this._resolvePairingContext(tournamentId, pairingId);
    if (ctx.error) return ctx;
    const entryId = this._findEntryIdByUserId(ctx.tournament, userId);
    if (!entryId) return { error: 'Bạn không tham gia giải đấu này.', code: 'NOT_A_PARTICIPANT' };
    const result = PairingLifecycle.requestReschedule(ctx.pairing, entryId, newProposedTime);
    if (!result.error) { this._persistPairing(ctx.pairing); this._emitPairingChanged(tournamentId, pairingId); }
    return result;
  }

  approvePairingReschedule(userId, tournamentId, pairingId) {
    const ctx = this._resolvePairingContext(tournamentId, pairingId);
    if (ctx.error) return ctx;
    const result = PairingLifecycle.approveReschedule(ctx.pairing, userId, ctx.tournament.organizerId);
    if (!result.error) { this._persistPairing(ctx.pairing); this._emitPairingChanged(tournamentId, pairingId); }
    return result;
  }

  denyPairingReschedule(userId, tournamentId, pairingId) {
    const ctx = this._resolvePairingContext(tournamentId, pairingId);
    if (ctx.error) return ctx;
    const result = PairingLifecycle.denyReschedule(ctx.pairing, userId, ctx.tournament.organizerId);
    if (!result.error) { this._persistPairing(ctx.pairing); this._emitPairingChanged(tournamentId, pairingId); }
    return result;
  }

  /**
   * A player checks in. On the Ready -> InProgress transition (both
   * checked in), starts a fresh TimerManager for the match (decision 7).
   */
  markPairingReady(userId, tournamentId, pairingId) {
    const ctx = this._resolvePairingContext(tournamentId, pairingId);
    if (ctx.error) return ctx;
    const entryId = this._findEntryIdByUserId(ctx.tournament, userId);
    if (!entryId) return { error: 'Bạn không tham gia giải đấu này.', code: 'NOT_A_PARTICIPANT' };

    const result = PairingLifecycle.markReady(ctx.pairing, entryId, {
      timerMode: ctx.tournament.ruleSet.timerMode,
      timerSeconds: ctx.tournament.ruleSet.timerSeconds,
      timerIncrementSeconds: ctx.tournament.ruleSet.timerIncrementSeconds,
    });
    if (result.error) return result;
    this._persistPairing(ctx.pairing);

    if (result.bothReady) {
      tournamentState.untrackDeadline(pairingId);
      tournamentState.tournamentTimerMap.set(pairingId, result.timer);
      result.timer.start();
      // Tells the socket layer (TournamentMatchHandler) to instantiate a
      // GameEngine and join both participants' sockets into the match room —
      // TournamentManager itself never touches io (see class header).
      this.emit('pairing_ready', { tournamentId, pairingId });
    }
    this._emitPairingChanged(tournamentId, pairingId);
    return { pairing: ctx.pairing, bothReady: result.bothReady };
  }

  /**
   * Record one finished GAME's result within a pairing (TODO.md #50 — a
   * pairing may be a multi-game series, not just one game). Normal
   * completion only — walkover/void-replay for a no-show come from the
   * deadline sweep instead, see _handlePairingDeadline.
   *
   * Pushes the game into pairing.games[], re-evaluates whether the SERIES
   * (not just this game) is decided via series.js#evaluateSeries, and only
   * then does one of:
   *   - series not decided: loop back to Ready for the next game
   *     (PairingLifecycle.startNextGame — fresh check-in/deadline window,
   *     see that function's doc comment for why) instead of completing.
   *   - series decided: complete the pairing exactly as before. In 'single'
   *     mode this is unconditionally true after the first game, so behavior
   *     for existing (non-series) tournaments is byte-for-byte unchanged.
   *
   * @param {string} tournamentId
   * @param {string} pairingId
   * @param {string} outcome — the winning entryId, or the literal string
   *   'draw', for the game that just ended (not necessarily the pairing).
   *   Double Elimination brackets have no slot for an undecided match — if
   *   the SERIES itself ends tied (fixedCount only; raceToMargin can never
   *   tie), it's treated like DoubleNoShow (void + fresh replay pairing,
   *   reusing the existing decision-5 mechanism) rather than silently
   *   picking a winner or leaving the bracket stuck. A single game within
   *   an ongoing series ending in a draw does NOT trigger this — draws
   *   count immediately toward the running score and play continues
   *   (planning.md decision 2).
   */
  recordPairingResult(tournamentId, pairingId, outcome) {
    const ctx = this._resolvePairingContext(tournamentId, pairingId);
    if (ctx.error) return ctx;
    if (ctx.pairing.state !== 'InProgress') {
      return { error: 'Ván đấu chưa bắt đầu hoặc đã kết thúc.', code: 'PAIRING_NOT_IN_PROGRESS' };
    }

    const pairing = ctx.pairing;
    const ruleSet = ctx.tournament.ruleSet;
    const isDraw = outcome === 'draw';
    const now = new Date().toISOString();

    pairing.games.push({ index: pairing.games.length, winnerEntryId: isDraw ? null : outcome, endedAt: now });
    pairing.seriesScore = seriesModule.computeSeriesScore(pairing.games, pairing.player1EntryId, pairing.player2EntryId);

    const evalResult = seriesModule.evaluateSeries(pairing.games, ruleSet, pairing.player1EntryId, pairing.player2EntryId);

    if (!evalResult.seriesComplete) {
      PairingLifecycle.startNextGame(pairing, ruleSet.schedulingWindowMs);
      this._persistPairing(pairing);
      this._teardownPairingTimer(pairingId);
      tournamentState.trackDeadline(pairingId, tournamentId, new Date(pairing.deadline).getTime());
      this._emitPairingChanged(tournamentId, pairingId);
      return { tournament: ctx.tournament, pairing, seriesComplete: false };
    }

    const seriesWinnerEntryId = evalResult.winnerEntryId;
    const seriesIsDraw = seriesWinnerEntryId === null;

    if (seriesIsDraw && ctx.tournament.format === 'double_elim') {
      pairing.state = 'DoubleNoShow';
      pairing.result = { winnerEntryId: null, reason: 'draw_replay' };
      pairing.endedAt = now;
      this._persistPairing(pairing);
      this._teardownPairingTimer(pairingId);
      const replay = this._createReplayPairing(ctx.tournament, pairing);
      this._emitPairingChanged(tournamentId, pairingId);
      return { tournament: ctx.tournament, pairing, replay };
    }

    pairing.state = 'Completed';
    pairing.result = {
      winnerEntryId: seriesWinnerEntryId,
      reason: seriesIsDraw ? 'draw' : ((ruleSet.seriesMode || 'single') === 'single' ? 'normal' : 'series_decided'),
    };
    pairing.endedAt = now;
    this._persistPairing(pairing);
    this._teardownPairingTimer(pairingId);

    this._recordCompletion(ctx.tournament, pairing, seriesIsDraw ? 'draw' : seriesWinnerEntryId);
    this._advanceIfRoundComplete(ctx.tournament);
    this._emitPairingChanged(tournamentId, pairingId);

    return { tournament: ctx.tournament, pairing };
  }

  // ---------------------------------------------------------------------------
  // Deadline sweep callback (installed on tournamentState in the constructor)
  // ---------------------------------------------------------------------------

  _handlePairingDeadline(pairingId, tournamentId) {
    const tournament = this.tournaments.get(tournamentId);
    const pairing = this.pairings.get(pairingId);
    if (!tournament || !pairing) return;

    const outcome = PairingLifecycle.resolveDeadline(pairing);
    tournamentState.untrackDeadline(pairingId);
    this._persistPairing(pairing);

    if (outcome.action === 'walkover') {
      this._recordCompletion(tournament, pairing, outcome.winnerEntryId);
      this._advanceIfRoundComplete(tournament);
    } else if (outcome.action === 'void_replay') {
      this._createReplayPairing(tournament, pairing);
    }
    // 'forced_organizer_resolution_needed': pairing.overdue=true, nothing
    // further automatic — awaits organizerResolvePairing().
    this._emitPairingChanged(tournamentId, pairingId);
  }

  /**
   * Notify the socket layer that a pairing's state changed — covers both
   * player/organizer-initiated actions AND automatic ones (deadline sweep,
   * bracket auto-sync) that have no socket call site of their own to
   * broadcast from. TournamentHandler.js is the sole listener that turns
   * this into a (batched) `tournament:pairings_patch` room broadcast, so every
   * mutation path funnels through here instead of each call site knowing
   * about io.
   */
  _emitPairingChanged(tournamentId, pairingId) {
    this.emit('pairing_changed', { tournamentId, pairingId });
  }

  // ---------------------------------------------------------------------------
  // Round/bracket advancement
  // ---------------------------------------------------------------------------

  /**
   * Double Elimination bracket match ids ('W1M1', 'GF', ...) come from the
   * Phase 2 engine's own local namespace, shared by EVERY tournament using
   * that format — not globally unique. Every id that becomes a real
   * `pairingId` (the key into `this.pairings`, tournamentState's maps, and
   * the DB's `tournament_pairings.id` PRIMARY KEY) must be scoped per
   * tournament, or two concurrent double_elim tournaments collide on
   * 'W1M1' and silently overwrite each other's rows. `tournament.bracketResults`
   * and calls into resolveBracket/needsBracketReset stay in the LOCAL
   * (unscoped) namespace, since that's what the pure Phase 2 functions
   * expect — only the pairing's own id crosses into global scope.
   */
  _deId(tournament, localMatchId) {
    return `${tournament.tournamentId}:${localMatchId}`;
  }

  /**
   * Persist + bump score bookkeeping for a just-terminal pairing with a
   * winner. For double_elim this also re-syncs the bracket — deliberately
   * unconditional on bye-vs-real (a bye's cascading effect can make a
   * losers-bracket match ITSELF resolve to a bye — see resolveBracket's
   * loser-slot-resolves-to-null case — so skipping sync for byes would miss
   * that cascade).
   */
  _recordCompletion(tournament, pairing, winnerEntryId) {
    tournament.completedPairings.push({
      player1: pairing.player1EntryId,
      player2: pairing.player2EntryId,
      winner: winnerEntryId,
    });

    if (tournament.format === 'double_elim') {
      if (pairing.player2EntryId !== null) {
        tournament.bracketResults.set(pairing.bracketMatchId, winnerEntryId);
      }
      this._syncDoubleElimPairings(tournament);
      this._checkDoubleElimComplete(tournament);
    }
  }

  /** Create every newly-resolvable Double Elimination match as a real pairing. */
  _syncDoubleElimPairings(tournament) {
    const resolved = doubleElimPairing.resolveBracket(tournament.bracket, tournament.bracketResults);
    const roundId = tournament.bracketRoundId;

    for (const [matchId, m] of Object.entries(resolved)) {
      const globalId = this._deId(tournament, matchId);
      if (this.pairings.has(globalId)) continue;
      if (m.player1 === undefined || m.player2 === undefined) continue;
      if (m.player1 === null && m.player2 === null) continue;
      this._createAndRegisterPairing(
        tournament,
        { pairingId: globalId, bracketMatchId: matchId, player1: m.player1, player2: m.player2 },
        roundId
      );
    }

    const gfResetId = this._deId(tournament, 'GF_RESET');
    if (tournament.bracket.grandFinal && tournament.bracketResults.has('GF') && !this.pairings.has(gfResetId)) {
      if (doubleElimPairing.needsBracketReset(tournament.bracket, tournament.bracketResults)) {
        const gf = resolved.GF;
        this._createAndRegisterPairing(
          tournament,
          { pairingId: gfResetId, bracketMatchId: 'GF_RESET', player1: gf.player1, player2: gf.player2 },
          roundId
        );
      }
    }
  }

  _checkDoubleElimComplete(tournament) {
    const gfResetId = this._deId(tournament, 'GF_RESET');
    const finalLocalId = tournament.bracket.grandFinal ? 'GF' : tournament.bracket.winners[0][0].id;
    const finalId = this.pairings.has(gfResetId) ? gfResetId : this._deId(tournament, finalLocalId);
    const finalPairing = this.pairings.get(finalId);
    if (finalPairing && finalPairing.state === 'Completed') {
      this._completeTournament(tournament);
    }
  }

  /** Check whether the round currently in flight (Swiss/Round robin only) is fully terminal, and advance if so. */
  _advanceIfRoundComplete(tournament) {
    if (tournament.format === 'double_elim') return; // advances via _syncDoubleElimPairings instead
    if (!tournament.currentRoundPairingIds || tournament.currentRoundPairingIds.size === 0) return;

    const allTerminal = [...tournament.currentRoundPairingIds].every((id) => {
      const p = this.pairings.get(id);
      return p && PairingLifecycle.TERMINAL_STATES.has(p.state);
    });
    if (!allTerminal) return;

    if (tournament.format === 'swiss') {
      if (tournament.currentRoundIndex >= tournament.totalRounds) {
        this._completeTournament(tournament);
        return;
      }
      const standings = this._computeSwissStandings(tournament);
      const nextPairings = swissPairing.generateNextRound(standings);
      tournament.currentRoundIndex += 1;
      this._materializeRound(tournament, nextPairings);
    } else if (tournament.format === 'round_robin') {
      const nextIndex = tournament.currentRoundIndex + 1;
      if (nextIndex >= tournament.allRounds.length) {
        this._completeTournament(tournament);
        return;
      }
      tournament.currentRoundIndex = nextIndex;
      this._materializeRound(tournament, tournament.allRounds[nextIndex]);
    }
  }

  _computeSwissStandings(tournament) {
    const entries = Array.from(tournament.entries.values()).map((e) => ({ id: e.entryId }));
    const raw = standingsModule.computeStandings(entries, tournament.completedPairings);
    return raw.map((s) => ({
      id: s.id,
      score: s.score,
      opponents: new Set(s.opponents),
      hadBye: !!tournament.entries.get(s.id)?.hadBye,
    }));
  }

  /** Create a new round's rows: a tournament_rounds record + one pairing per spec entry. */
  _materializeRound(tournament, pairingsSpec) {
    const roundId = uuidv4();
    database.createTournamentRound({
      id: roundId,
      tournamentId: tournament.tournamentId,
      roundIndex: tournament.currentRoundIndex,
      bracketSide: null,
    });

    tournament.currentRoundPairingIds = new Set();
    for (const spec of pairingsSpec) {
      const pairing = this._createAndRegisterPairing(tournament, spec, roundId, tournament.currentRoundIndex);
      tournament.currentRoundPairingIds.add(pairing.pairingId);
    }

    // Covers the degenerate "round is a single bye" case (only 1 active
    // player left) — otherwise a no-op since real matches stay Negotiating.
    this._advanceIfRoundComplete(tournament);
  }

  /**
   * Create one pairing (real match or bye) and wire up its persistence +
   * deadline tracking. `spec.pairingId` lets Double Elimination reuse its
   * bracket match ids directly instead of minting a new uuid.
   *
   * @param {number|null} roundIndex — Swiss/Round robin's 1-based round
   *   number, for the client to group pairings by round (Phase 6). Double
   *   Elimination has no discrete rounds in this sense (one synthetic DB row
   *   for the whole bracket) — left null; the client renders those as a
   *   flat, unsectioned list instead of grouping.
   */
  _createAndRegisterPairing(tournament, spec, roundId, roundIndex = null) {
    const pairingId = spec.pairingId || uuidv4();
    const now = new Date();
    const deadline = new Date(now.getTime() + tournament.ruleSet.schedulingWindowMs).toISOString();

    const pairing = PairingLifecycle.createPairing({
      pairingId,
      tournamentId: tournament.tournamentId,
      roundId,
      player1EntryId: spec.player1,
      player2EntryId: spec.player2 ?? null,
      deadline,
      pairedAt: now.toISOString(),
    });

    if (pairing.state === 'Paired') PairingLifecycle.announcePairing(pairing);

    // Not persisted to SQLite — pure in-memory bookkeeping/display fields.
    // bracketMatchId: the LOCAL (unscoped) Double Elimination match id this
    // globally-scoped pairingId corresponds to — see _deId's doc comment.
    pairing.bracketMatchId = spec.bracketMatchId || null;
    pairing.roundIndex = roundIndex;

    this.pairings.set(pairingId, pairing);
    this._persistPairing(pairing);

    if (pairing.state === 'Completed') {
      // Bye.
      const entry = tournament.entries.get(spec.player1);
      if (entry) entry.hadBye = true;
      this._recordCompletion(tournament, pairing, pairing.result.winnerEntryId);
    } else {
      tournamentState.trackDeadline(pairingId, tournament.tournamentId, new Date(deadline).getTime());
    }

    this._emitPairingChanged(tournament.tournamentId, pairingId);
    return pairing;
  }

  /**
   * Void/replay (decision 5): Round robin/Swiss get a brand-new pairing
   * (their formats have no fixed slot-graph referencing the old id). Double
   * Elimination MUST reuse the same pairingId — other bracket matches
   * reference it by id — so it's reset in place instead.
   */
  _createReplayPairing(tournament, oldPairing) {
    const schedulingWindowMs = tournament.ruleSet.schedulingWindowMs;
    const now = new Date();
    const deadline = new Date(now.getTime() + schedulingWindowMs).toISOString();

    if (tournament.format === 'double_elim') {
      Object.assign(oldPairing, {
        state: 'Negotiating',
        proposedTime: null,
        reportedBy: null,
        disputed: false,
        overdue: false,
        agreedTime: null,
        rescheduleRequest: null,
        readyPlayers: new Set(),
        pairedAt: now.toISOString(),
        deadline,
        result: null,
        // A void/replay (whether from a mid-series double-no-show or the
        // whole series ending tied) restarts the series from scratch — the
        // old games[]/seriesScore must not leak into the replay.
        games: [],
        seriesScore: null,
        startedAt: null,
        endedAt: null,
      });
      this._persistPairing(oldPairing);
      tournamentState.trackDeadline(oldPairing.pairingId, tournament.tournamentId, new Date(deadline).getTime());
      this._emitPairingChanged(tournament.tournamentId, oldPairing.pairingId);
      return oldPairing;
    }

    const replay = PairingLifecycle.createPairing({
      pairingId: uuidv4(),
      tournamentId: tournament.tournamentId,
      roundId: oldPairing.roundId,
      player1EntryId: oldPairing.player1EntryId,
      player2EntryId: oldPairing.player2EntryId,
      deadline,
      pairedAt: now.toISOString(),
    });
    PairingLifecycle.announcePairing(replay);
    replay.roundIndex = oldPairing.roundIndex;

    this.pairings.set(replay.pairingId, replay);
    this._persistPairing(replay);
    tournamentState.trackDeadline(replay.pairingId, tournament.tournamentId, new Date(deadline).getTime());

    if (tournament.currentRoundPairingIds) {
      tournament.currentRoundPairingIds.delete(oldPairing.pairingId);
      tournament.currentRoundPairingIds.add(replay.pairingId);
    }
    this._emitPairingChanged(tournament.tournamentId, replay.pairingId);
    return replay;
  }

  _teardownPairingTimer(pairingId) {
    const timer = tournamentState.tournamentTimerMap.get(pairingId);
    if (timer) {
      timer.destroy();
      tournamentState.tournamentTimerMap.delete(pairingId);
    }
  }

  _persistPairing(pairing) {
    database.savePairing(pairing);
  }

  _completeTournament(tournament) {
    tournament.status = 'completed';
    tournament.completedAt = new Date().toISOString();
    database.updateTournamentStatus(tournament.tournamentId, 'completed', { completedAt: tournament.completedAt });

    if (tournament.format === 'double_elim') {
      this._assignDoubleElimFinalRanks(tournament);
    } else {
      const entries = Array.from(tournament.entries.values()).map((e) => ({ id: e.entryId }));
      const standings = standingsModule.computeStandings(entries, tournament.completedPairings);
      const tiebreaks = standingsModule.computeTiebreaks(standings, tournament.completedPairings);
      const ranked = standingsModule.rankStandings(tiebreaks);
      for (const row of ranked) {
        const entry = tournament.entries.get(row.id);
        if (entry) entry.finalRank = row.rank;
      }
    }

    this.emit('tournament_completed', tournament.tournamentId);
    logger.info(`[TournamentManager] Tournament ${tournament.tournamentId} completed`);
  }

  /**
   * Double Elimination final placement: champion (1st) and runner-up (2nd)
   * are exact — the grand final / bracket-reset match decides them
   * directly. Full 3rd-place-and-below placement needs bracket-elimination-
   * depth tracking that's out of scope for this phase (DE win-count isn't a
   * meaningful ranking signal the way it is for Swiss/Round robin, so a
   * score-based approximation would be actively misleading) — left null
   * with this TODO rather than shipping an incorrect placement.
   */
  _assignDoubleElimFinalRanks(tournament) {
    const gfResetId = this._deId(tournament, 'GF_RESET');
    const finalLocalId = tournament.bracket.grandFinal ? 'GF' : tournament.bracket.winners[0][0].id;
    const finalId = this.pairings.has(gfResetId) ? gfResetId : this._deId(tournament, finalLocalId);
    const finalPairing = this.pairings.get(finalId);
    if (!finalPairing || !finalPairing.result) return;

    const championId = finalPairing.result.winnerEntryId;
    const runnerUpId = championId === finalPairing.player1EntryId ? finalPairing.player2EntryId : finalPairing.player1EntryId;
    const championEntry = tournament.entries.get(championId);
    const runnerUpEntry = tournament.entries.get(runnerUpId);
    if (championEntry) championEntry.finalRank = 1;
    if (runnerUpEntry) runnerUpEntry.finalRank = 2;
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
        organizerName: tournament.organizerName,
        playerCount: tournament.entries.size,
        status: tournament.status,
        // Lets the lobby card show "you're registered"/"you organize this"
        // without a round-trip per card — the list summary otherwise has no
        // per-entry detail at all.
        entryUserIds: Array.from(tournament.entries.values()).map((e) => e.userId),
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
      organizerName: tournament.organizerName,
      ruleSet: { ...tournament.ruleSet },
      status: tournament.status,
      entries,
      createdAt: tournament.createdAt,
      startedAt: tournament.startedAt,
      completedAt: tournament.completedAt,
      cancelledAt: tournament.cancelledAt ?? null,
      cancelReason: tournament.cancelReason ?? null,
      // Swiss/Round robin only — lets the client show "Round 2 / 4" and group
      // pairings by round. Double Elimination has no analogous single number
      // (a bracket has depth, not a round count), left null/undefined.
      currentRoundIndex: tournament.currentRoundIndex ?? null,
      totalRounds: tournament.format === 'swiss'
        ? (tournament.totalRounds ?? null)
        : (tournament.format === 'round_robin' ? (tournament.allRounds ? tournament.allRounds.length : null) : null),
    };
  }

  /**
   * Broadcast shape for `tournament:updated` — everything serializeTournament
   * sends except ruleSet. Still the FULL entries array; TournamentHandler.js's
   * broadcastTournamentDetail() is what diffs `entries` down to an
   * upserts/removed patch before emitting, same split as
   * listTournaments()/serializeTournamentUpdate() vs. state.js's
   * broadcastLobbyUpdate() diffing the room list one layer up.
   */
  serializeTournamentUpdate(tournament) {
    const payload = this.serializeTournament(tournament);
    delete payload.ruleSet;
    return payload;
  }

  /** Socket-safe pairing snapshot — readyPlayers (a Set) becomes a plain array. */
  serializePairing(pairing) {
    return {
      pairingId: pairing.pairingId,
      tournamentId: pairing.tournamentId,
      roundId: pairing.roundId,
      roundIndex: pairing.roundIndex ?? null,
      player1EntryId: pairing.player1EntryId,
      player2EntryId: pairing.player2EntryId,
      state: pairing.state,
      proposedTime: pairing.proposedTime,
      reportedBy: pairing.reportedBy,
      disputed: pairing.disputed,
      overdue: pairing.overdue,
      agreedTime: pairing.agreedTime,
      rescheduleRequest: pairing.rescheduleRequest,
      readyPlayers: Array.from(pairing.readyPlayers),
      deadline: pairing.deadline,
      pairedAt: pairing.pairedAt,
      result: pairing.result,
      games: pairing.games,
      seriesScore: pairing.seriesScore,
      startedAt: pairing.startedAt,
      endedAt: pairing.endedAt,
    };
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

    // Pairing game series (TODO.md #50) — 'single' is the required default,
    // reproducing today's one-game-per-pairing behavior exactly for every
    // tournament that doesn't opt in. An organizer-supplied 'fixedCount'/
    // 'raceToMargin' with an invalid or missing companion field (game count,
    // or target+margin) falls back to 'single' rather than risking a
    // pairing stuck mid-series with a nonsensical config (e.g. an uncapped
    // race with target=0 would "complete" after the very first game).
    let seriesMode = seriesModule.VALID_SERIES_MODES.includes(ruleSet.seriesMode) ? ruleSet.seriesMode : 'single';
    let seriesGameCount = null;
    let seriesTargetScore = null;
    let seriesMargin = null;

    if (seriesMode === 'fixedCount') {
      const n = ruleSet.seriesGameCount;
      if (typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 99) {
        seriesGameCount = n;
      } else {
        seriesMode = 'single';
      }
    } else if (seriesMode === 'raceToMargin') {
      const target = ruleSet.seriesTargetScore;
      const margin = ruleSet.seriesMargin;
      if (typeof target === 'number' && target > 0 && typeof margin === 'number' && margin > 0) {
        seriesTargetScore = target;
        seriesMargin = margin;
      } else {
        seriesMode = 'single';
      }
    }

    r.seriesMode = seriesMode;
    r.seriesGameCount = seriesGameCount;
    r.seriesTargetScore = seriesTargetScore;
    r.seriesMargin = seriesMargin;

    return r;
  }
}

// Export singleton instance — TournamentManager is the single source of truth
module.exports = new TournamentManager();
