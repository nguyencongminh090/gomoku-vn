'use strict';

/**
 * PairingLifecycle.js — the match-scheduling state machine, operating on a
 * single pairing object at a time (see
 * features/tournament/diagram/uml_diagram/state-diagram-match-lifecycle.md).
 *
 * States: Paired -> Negotiating -> Reported -> Ready -> InProgress -> Completed
 *   Reported -> Reported (dispute, needs organizer)
 *   Reported/Negotiating -> OrganizerAdjusted (organizer rearranges/releases)
 *   Ready -> Walkover | DoubleNoShow (deadline fires — see resolveDeadline)
 *
 * Two documented interpretations (see docs/instruction/B48-*.md "Cập nhật
 * 2026-08-05"):
 *   1. Reported -> Ready is automatic once both sides agree on a time
 *      (report + confirm) — the diagram's "Organizer confirms" label only
 *      applies to the dispute branch, per the sequence diagram's happy path.
 *   2. One deadline field per pairing; resolveDeadline() branches on
 *      whichever sub-state is actually reached when it fires.
 *
 * Functions here don't hold any state themselves and don't look anything up
 * by id — callers (TournamentManager) own the pairing objects and pass in
 * whatever privileged-id context is needed for an authorization check, so
 * this module stays testable without a TournamentManager/tournaments Map in
 * scope.
 */

const TimerManager = require('../TimerManager');
const logger = require('../../utils/logger');

const TERMINAL_STATES = new Set(['Completed', 'Walkover', 'DoubleNoShow', 'OrganizerAdjusted']);

/**
 * Create a new pairing in its initial state. Byes (player2EntryId === null)
 * are immediately resolved to Completed — they reuse the lifecycle's
 * terminal state rather than a bye-specific status (Phase 2 convention).
 *
 * @param {{pairingId: string, tournamentId: string, roundId: string,
 *   player1EntryId: string, player2EntryId: string|null,
 *   deadline: string, pairedAt: string}} init
 * @returns {object} pairing
 */
function createPairing(init) {
  const pairing = {
    pairingId: init.pairingId,
    tournamentId: init.tournamentId,
    roundId: init.roundId,
    player1EntryId: init.player1EntryId,
    player2EntryId: init.player2EntryId,
    state: 'Paired',
    proposedTime: null,
    reportedBy: null,
    disputed: false,
    overdue: false,
    agreedTime: null,
    rescheduleRequest: null,
    readyPlayers: new Set(),
    deadline: init.deadline,
    pairedAt: init.pairedAt,
    result: null,
    startedAt: null,
    endedAt: null,
  };

  if (pairing.player2EntryId === null) {
    pairing.state = 'Completed';
    pairing.result = { winnerEntryId: pairing.player1EntryId, reason: 'bye' };
    pairing.endedAt = init.pairedAt;
    return pairing;
  }

  return pairing;
}

/** Paired -> Negotiating. Called immediately after creation (no user action). */
function announcePairing(pairing) {
  if (pairing.state !== 'Paired') {
    return { error: 'Cặp đấu đã được thông báo rồi.', code: 'ALREADY_ANNOUNCED' };
  }
  pairing.state = 'Negotiating';
  return { pairing };
}

function isParticipant(pairing, entryId) {
  return entryId === pairing.player1EntryId || entryId === pairing.player2EntryId;
}

/** Negotiating -> Reported. Either player may report the time they agreed on with their opponent. */
function reportTime(pairing, entryId, proposedTime) {
  if (!isParticipant(pairing, entryId)) {
    return { error: 'Bạn không phải người chơi trong cặp đấu này.', code: 'NOT_A_PARTICIPANT' };
  }
  if (pairing.state !== 'Negotiating') {
    return { error: 'Không thể báo giờ ở trạng thái hiện tại.', code: 'INVALID_STATE' };
  }
  pairing.proposedTime = proposedTime;
  pairing.reportedBy = entryId;
  pairing.state = 'Reported';
  return { pairing };
}

/**
 * Reported -> Ready. The OTHER participant confirms the reported time —
 * mutual agreement, no organizer involved (documented interpretation 1).
 */
function confirmTime(pairing, entryId) {
  if (!isParticipant(pairing, entryId)) {
    return { error: 'Bạn không phải người chơi trong cặp đấu này.', code: 'NOT_A_PARTICIPANT' };
  }
  if (pairing.state !== 'Reported' || pairing.disputed) {
    return { error: 'Không có giờ nào đang chờ xác nhận.', code: 'INVALID_STATE' };
  }
  if (entryId === pairing.reportedBy) {
    return { error: 'Người báo giờ không thể tự xác nhận — cần đối thủ xác nhận.', code: 'CANNOT_CONFIRM_OWN_REPORT' };
  }
  pairing.agreedTime = pairing.proposedTime;
  pairing.state = 'Ready';
  return { pairing };
}

/** Reported -> Reported (disputed=true). Routes to the organizer — no further self-service negotiation. */
function disputeTime(pairing, entryId) {
  if (!isParticipant(pairing, entryId)) {
    return { error: 'Bạn không phải người chơi trong cặp đấu này.', code: 'NOT_A_PARTICIPANT' };
  }
  if (pairing.state !== 'Reported') {
    return { error: 'Không có giờ nào đang chờ để tranh chấp.', code: 'INVALID_STATE' };
  }
  if (entryId === pairing.reportedBy) {
    return { error: 'Người báo giờ không thể tự tranh chấp giờ của chính mình.', code: 'CANNOT_DISPUTE_OWN_REPORT' };
  }
  pairing.disputed = true;
  return { pairing };
}

/**
 * Organizer resolves a dispute (or is asked to set the time directly):
 * Reported -> Ready. If the pairing had gone `overdue` (deadline already
 * fired while stuck in dispute — see resolveDeadline), a fresh scheduling
 * window is granted from now; otherwise the original deadline is untouched.
 *
 * @param {object} pairing
 * @param {string} requestingUserId
 * @param {string} organizerId — the tournament's real organizerId, resolved by the caller
 * @param {string} finalTime
 * @param {number} [schedulingWindowMs] — required only if pairing.overdue is true
 */
function organizerResolve(pairing, requestingUserId, organizerId, finalTime, schedulingWindowMs) {
  if (requestingUserId !== organizerId) {
    return { error: 'Chỉ người tổ chức mới có thể giải quyết tranh chấp.', code: 'ORGANIZER_ONLY' };
  }
  if (pairing.state !== 'Reported') {
    return { error: 'Không có tranh chấp nào để giải quyết.', code: 'INVALID_STATE' };
  }
  pairing.agreedTime = finalTime;
  pairing.disputed = false;
  pairing.state = 'Ready';
  if (pairing.overdue) {
    pairing.overdue = false;
    pairing.deadline = new Date(Date.now() + (schedulingWindowMs || 0)).toISOString();
  }
  return { pairing };
}

/** Negotiating/Reported -> OrganizerAdjusted. Organizer manually rearranges or releases the pairing. */
function organizerAdjust(pairing, requestingUserId, organizerId, reason) {
  if (requestingUserId !== organizerId) {
    return { error: 'Chỉ người tổ chức mới có thể điều chỉnh cặp đấu.', code: 'ORGANIZER_ONLY' };
  }
  if (pairing.state !== 'Negotiating' && pairing.state !== 'Reported') {
    return { error: 'Không thể điều chỉnh cặp đấu ở trạng thái hiện tại.', code: 'INVALID_STATE' };
  }
  pairing.state = 'OrganizerAdjusted';
  pairing.result = { winnerEntryId: null, reason: reason || 'organizer_adjusted' };
  pairing.endedAt = new Date().toISOString();
  return { pairing };
}

/**
 * A player requests a different time than the already-agreed one (decision
 * 3: organizer approval required, no unilateral change by either player).
 * Stays in 'Ready' — the request is a pending flag, not a state transition.
 */
function requestReschedule(pairing, entryId, newProposedTime) {
  if (!isParticipant(pairing, entryId)) {
    return { error: 'Bạn không phải người chơi trong cặp đấu này.', code: 'NOT_A_PARTICIPANT' };
  }
  if (pairing.state !== 'Ready') {
    return { error: 'Chỉ có thể xin đổi lịch khi đã có giờ thống nhất.', code: 'INVALID_STATE' };
  }
  pairing.rescheduleRequest = { requestedBy: entryId, newTime: newProposedTime };
  return { pairing };
}

/**
 * Organizer approves a pending reschedule request: agreedTime changes to
 * the requested time, but — per the minor implementation call documented in
 * docs/instruction/B48-*.md — the original `deadline` is NOT reset. It stays
 * anchored to `pairedAt` (decision 2: "per-match window from pairing").
 */
function approveReschedule(pairing, requestingUserId, organizerId) {
  if (requestingUserId !== organizerId) {
    return { error: 'Chỉ người tổ chức mới có thể duyệt đổi lịch.', code: 'ORGANIZER_ONLY' };
  }
  if (!pairing.rescheduleRequest) {
    return { error: 'Không có yêu cầu đổi lịch nào đang chờ.', code: 'NO_PENDING_REQUEST' };
  }
  pairing.agreedTime = pairing.rescheduleRequest.newTime;
  pairing.rescheduleRequest = null;
  return { pairing };
}

/** Organizer denies a pending reschedule request: agreedTime/deadline unchanged. */
function denyReschedule(pairing, requestingUserId, organizerId) {
  if (requestingUserId !== organizerId) {
    return { error: 'Chỉ người tổ chức mới có thể từ chối đổi lịch.', code: 'ORGANIZER_ONLY' };
  }
  if (!pairing.rescheduleRequest) {
    return { error: 'Không có yêu cầu đổi lịch nào đang chờ.', code: 'NO_PENDING_REQUEST' };
  }
  pairing.rescheduleRequest = null;
  return { pairing };
}

/**
 * A player checks in. Ready -> InProgress once both have checked in — at
 * that point a TimerManager instance is created (decision 7: reuse the
 * class, but a new per-pairing instance, stored by the caller in a Map
 * separate from casual games' timerMap).
 *
 * @param {object} pairing
 * @param {string} entryId
 * @param {{timerMode: string, timerSeconds: number, timerIncrementSeconds: number}} timeControl
 * @returns {{pairing: object, bothReady: boolean, timer?: TimerManager} | {error, code}}
 */
function markReady(pairing, entryId, timeControl) {
  if (!isParticipant(pairing, entryId)) {
    return { error: 'Bạn không phải người chơi trong cặp đấu này.', code: 'NOT_A_PARTICIPANT' };
  }
  if (pairing.state !== 'Ready') {
    return { error: 'Chưa thể check-in ở trạng thái hiện tại.', code: 'INVALID_STATE' };
  }
  pairing.readyPlayers.add(entryId);

  const bothReady = pairing.readyPlayers.has(pairing.player1EntryId) && pairing.readyPlayers.has(pairing.player2EntryId);
  if (!bothReady) {
    return { pairing, bothReady: false };
  }

  pairing.state = 'InProgress';
  pairing.startedAt = new Date().toISOString();

  // Placeholder black/white assignment (player1=black, player2=white) —
  // real seat/color assignment (e.g. via the Swap2 opening rule) is decided
  // when GameEngine is created in a later phase; TimerManager only needs two
  // distinct labels to track separately until then.
  const timer = new TimerManager({
    roomId: pairing.pairingId,
    mode: timeControl.timerMode,
    seconds: timeControl.timerSeconds,
    incrementSeconds: timeControl.timerIncrementSeconds,
    blackPlayerId: pairing.player1EntryId,
    whitePlayerId: pairing.player2EntryId,
  });

  logger.info(`[PairingLifecycle] Pairing ${pairing.pairingId} InProgress — timer created`);
  return { pairing, bothReady: true, timer };
}

/**
 * Deadline sweep callback (design answer (b) — see tournamentState.js for
 * the interval that calls this). Branches on the pairing's actual sub-state
 * when the single per-match deadline fires:
 *   - Reported + disputed, unresolved: flagged `overdue`, awaits forced
 *     organizer resolution (no automatic outcome — nobody has agreed a time).
 *   - Exactly one player marked ready: Walkover (decision 1 — round loss
 *     only, no further penalty; the present player wins, absent scores 0).
 *   - Zero players ready (never negotiated, or negotiated but nobody
 *     checked in): DoubleNoShow, resolved as void/replay (decision 5).
 *
 * Never called for a pairing already InProgress or terminal — the caller
 * (tournamentState's sweep) only holds pending deadlines for pairings still
 * short of InProgress.
 *
 * @param {object} pairing
 * @returns {{pairing: object, action: 'forced_organizer_resolution_needed'|'walkover'|'void_replay', winnerEntryId?: string, absentEntryId?: string}}
 */
function resolveDeadline(pairing) {
  if (TERMINAL_STATES.has(pairing.state) || pairing.state === 'InProgress') {
    return { pairing, action: 'none' };
  }

  if (pairing.state === 'Reported' && pairing.disputed) {
    pairing.overdue = true;
    return { pairing, action: 'forced_organizer_resolution_needed' };
  }

  if (pairing.readyPlayers.size === 1) {
    const readyEntryId = [...pairing.readyPlayers][0];
    const absentEntryId = readyEntryId === pairing.player1EntryId ? pairing.player2EntryId : pairing.player1EntryId;
    pairing.state = 'Walkover';
    pairing.result = { winnerEntryId: readyEntryId, reason: 'walkover' };
    pairing.endedAt = new Date().toISOString();
    return { pairing, action: 'walkover', winnerEntryId: readyEntryId, absentEntryId };
  }

  pairing.state = 'DoubleNoShow';
  pairing.result = { winnerEntryId: null, reason: 'void_replay' };
  pairing.endedAt = new Date().toISOString();
  return { pairing, action: 'void_replay' };
}

module.exports = {
  TERMINAL_STATES,
  createPairing,
  announcePairing,
  reportTime,
  confirmTime,
  disputeTime,
  organizerResolve,
  organizerAdjust,
  requestReschedule,
  approveReschedule,
  denyReschedule,
  markReady,
  resolveDeadline,
};
