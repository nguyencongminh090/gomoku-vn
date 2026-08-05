'use strict';

/**
 * PairingLifecycle.test.js — Unit tests for the match-scheduling state
 * machine (Phase 3, TODO.md #48). Covers the full valid/invalid transition
 * decision table from
 * features/tournament/diagram/uml_diagram/state-diagram-match-lifecycle.md,
 * plus the two documented interpretations noted in the module header.
 */

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const PairingLifecycle = require('../managers/tournament/PairingLifecycle');

const TIME_CONTROL = { timerMode: 'per_move', timerSeconds: 60, timerIncrementSeconds: 0 };

function freshPairing(overrides = {}) {
  return PairingLifecycle.createPairing({
    pairingId: 'pair-1',
    tournamentId: 't-1',
    roundId: 'round-1',
    player1EntryId: 'e1',
    player2EntryId: 'e2',
    deadline: new Date(Date.now() + 60_000).toISOString(),
    pairedAt: new Date().toISOString(),
    ...overrides,
  });
}

// ── Creation / byes ─────────────────────────────────────────────────────

describe('createPairing', () => {
  test('a real pairing (both entries) starts in Paired', () => {
    const p = freshPairing();
    expect(p.state).toBe('Paired');
  });

  test('a bye (player2EntryId=null) is immediately Completed — reuses the terminal state, no bye-specific status', () => {
    const p = freshPairing({ player2EntryId: null });
    expect(p.state).toBe('Completed');
    expect(p.result).toEqual({ winnerEntryId: 'e1', reason: 'bye' });
  });
});

// ── Full transition decision table ──────────────────────────────────────

describe('announcePairing (Paired -> Negotiating)', () => {
  test('valid: Paired -> Negotiating', () => {
    const p = freshPairing();
    const { pairing, error } = PairingLifecycle.announcePairing(p);
    expect(error).toBeUndefined();
    expect(pairing.state).toBe('Negotiating');
  });

  test('invalid: cannot re-announce an already-announced pairing', () => {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    const { error, code } = PairingLifecycle.announcePairing(p);
    expect(code).toBe('ALREADY_ANNOUNCED');
    expect(error).toBeTruthy();
  });
});

describe('reportTime (Negotiating -> Reported)', () => {
  test('valid: a participant reports a time', () => {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    const { pairing, error } = PairingLifecycle.reportTime(p, 'e1', '2026-09-01T10:00:00Z');
    expect(error).toBeUndefined();
    expect(pairing.state).toBe('Reported');
    expect(pairing.proposedTime).toBe('2026-09-01T10:00:00Z');
    expect(pairing.reportedBy).toBe('e1');
  });

  test('invalid: a non-participant cannot report a time', () => {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    const { error, code } = PairingLifecycle.reportTime(p, 'stranger', '2026-09-01T10:00:00Z');
    expect(code).toBe('NOT_A_PARTICIPANT');
    expect(error).toBeTruthy();
    expect(p.state).toBe('Negotiating'); // unchanged
  });

  test('invalid: cannot report before the pairing has been announced (still Paired)', () => {
    const p = freshPairing();
    const { code } = PairingLifecycle.reportTime(p, 'e1', '2026-09-01T10:00:00Z');
    expect(code).toBe('INVALID_STATE');
  });

  test('invalid: cannot report a second time once already Reported', () => {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    PairingLifecycle.reportTime(p, 'e1', '2026-09-01T10:00:00Z');
    const { code } = PairingLifecycle.reportTime(p, 'e2', '2026-09-02T10:00:00Z');
    expect(code).toBe('INVALID_STATE');
  });
});

describe('confirmTime (Reported -> Ready) — documented interpretation 1: automatic on mutual agreement', () => {
  function reportedPairing() {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    PairingLifecycle.reportTime(p, 'e1', '2026-09-01T10:00:00Z');
    return p;
  }

  test('valid: the OTHER participant confirms -> Ready, no organizer involved', () => {
    const p = reportedPairing();
    const { pairing, error } = PairingLifecycle.confirmTime(p, 'e2');
    expect(error).toBeUndefined();
    expect(pairing.state).toBe('Ready');
    expect(pairing.agreedTime).toBe('2026-09-01T10:00:00Z');
  });

  test('invalid: the reporter cannot confirm their own report', () => {
    const p = reportedPairing();
    const { error, code } = PairingLifecycle.confirmTime(p, 'e1');
    expect(code).toBe('CANNOT_CONFIRM_OWN_REPORT');
    expect(error).toBeTruthy();
    expect(p.state).toBe('Reported');
  });

  test('invalid: a non-participant cannot confirm', () => {
    const p = reportedPairing();
    const { code } = PairingLifecycle.confirmTime(p, 'stranger');
    expect(code).toBe('NOT_A_PARTICIPANT');
  });

  test('invalid: cannot confirm when nothing has been reported (still Negotiating)', () => {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    const { code } = PairingLifecycle.confirmTime(p, 'e2');
    expect(code).toBe('INVALID_STATE');
  });

  test('invalid: cannot confirm a disputed report — must go through the organizer', () => {
    const p = reportedPairing();
    PairingLifecycle.disputeTime(p, 'e2');
    const { code } = PairingLifecycle.confirmTime(p, 'e2');
    expect(code).toBe('INVALID_STATE');
  });
});

describe('disputeTime (Reported -> Reported, disputed=true)', () => {
  function reportedPairing() {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    PairingLifecycle.reportTime(p, 'e1', '2026-09-01T10:00:00Z');
    return p;
  }

  test('valid: the other participant disputes', () => {
    const p = reportedPairing();
    const { pairing, error } = PairingLifecycle.disputeTime(p, 'e2');
    expect(error).toBeUndefined();
    expect(pairing.state).toBe('Reported');
    expect(pairing.disputed).toBe(true);
  });

  test('invalid: the reporter cannot dispute their own report', () => {
    const p = reportedPairing();
    const { code } = PairingLifecycle.disputeTime(p, 'e1');
    expect(code).toBe('CANNOT_DISPUTE_OWN_REPORT');
  });

  test('invalid: a non-participant cannot dispute', () => {
    const p = reportedPairing();
    const { code } = PairingLifecycle.disputeTime(p, 'stranger');
    expect(code).toBe('NOT_A_PARTICIPANT');
  });
});

describe('organizerResolve (Reported -> Ready)', () => {
  function disputedPairing() {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    PairingLifecycle.reportTime(p, 'e1', '2026-09-01T10:00:00Z');
    PairingLifecycle.disputeTime(p, 'e2');
    return p;
  }

  test('valid: the real organizer resolves the dispute', () => {
    const p = disputedPairing();
    const { pairing, error } = PairingLifecycle.organizerResolve(p, 'org-1', 'org-1', '2026-09-03T10:00:00Z');
    expect(error).toBeUndefined();
    expect(pairing.state).toBe('Ready');
    expect(pairing.agreedTime).toBe('2026-09-03T10:00:00Z');
    expect(pairing.disputed).toBe(false);
  });

  test('invalid: a non-organizer cannot resolve — written first per instruction.md\'s "check auth before mutation" rule', () => {
    const p = disputedPairing();
    const before = JSON.stringify(p);
    const { error, code } = PairingLifecycle.organizerResolve(p, 'intruder', 'org-1', '2026-09-03T10:00:00Z');
    expect(code).toBe('ORGANIZER_ONLY');
    expect(error).toBeTruthy();
    expect(JSON.stringify(p)).toBe(before); // no partial mutation on a rejected auth check
  });

  test('invalid: cannot resolve when there is nothing pending', () => {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    const { code } = PairingLifecycle.organizerResolve(p, 'org-1', 'org-1', '2026-09-03T10:00:00Z');
    expect(code).toBe('INVALID_STATE');
  });

  test('when the pairing was overdue, resolving grants a fresh deadline window instead of leaving the expired one', () => {
    const p = disputedPairing();
    p.overdue = true;
    const before = p.deadline;
    const { pairing } = PairingLifecycle.organizerResolve(p, 'org-1', 'org-1', '2026-09-03T10:00:00Z', 48 * 60 * 60 * 1000);
    expect(pairing.overdue).toBe(false);
    expect(pairing.deadline).not.toBe(before);
    expect(new Date(pairing.deadline).getTime()).toBeGreaterThan(Date.now());
  });

  test('when the pairing was NOT overdue, resolving leaves the original deadline untouched', () => {
    const p = disputedPairing();
    const before = p.deadline;
    const { pairing } = PairingLifecycle.organizerResolve(p, 'org-1', 'org-1', '2026-09-03T10:00:00Z', 48 * 60 * 60 * 1000);
    expect(pairing.deadline).toBe(before);
  });
});

describe('organizerAdjust (Negotiating/Reported -> OrganizerAdjusted)', () => {
  test('valid: from Negotiating', () => {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    const { pairing, error } = PairingLifecycle.organizerAdjust(p, 'org-1', 'org-1', 'released');
    expect(error).toBeUndefined();
    expect(pairing.state).toBe('OrganizerAdjusted');
  });

  test('valid: from Reported', () => {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    PairingLifecycle.reportTime(p, 'e1', '2026-09-01T10:00:00Z');
    const { pairing } = PairingLifecycle.organizerAdjust(p, 'org-1', 'org-1', 'released');
    expect(pairing.state).toBe('OrganizerAdjusted');
  });

  test('invalid: a non-organizer cannot adjust', () => {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    const { code } = PairingLifecycle.organizerAdjust(p, 'intruder', 'org-1', 'released');
    expect(code).toBe('ORGANIZER_ONLY');
    expect(p.state).toBe('Negotiating');
  });

  test('invalid: cannot adjust a pairing already InProgress', () => {
    const p = readyPairingBothChecking();
    PairingLifecycle.markReady(p, 'e1', TIME_CONTROL);
    const { timer } = PairingLifecycle.markReady(p, 'e2', TIME_CONTROL);
    expect(p.state).toBe('InProgress');
    const { code } = PairingLifecycle.organizerAdjust(p, 'org-1', 'org-1', 'x');
    expect(code).toBe('INVALID_STATE');
    timer.destroy();
  });
});

function readyPairingBothChecking() {
  const p = freshPairing();
  PairingLifecycle.announcePairing(p);
  PairingLifecycle.reportTime(p, 'e1', '2026-09-01T10:00:00Z');
  PairingLifecycle.confirmTime(p, 'e2');
  return p;
}

describe('requestReschedule / approveReschedule / denyReschedule (decision 3)', () => {
  test('valid: a participant requests a reschedule while Ready', () => {
    const p = readyPairingBothChecking();
    const { pairing, error } = PairingLifecycle.requestReschedule(p, 'e1', '2026-09-05T10:00:00Z');
    expect(error).toBeUndefined();
    expect(pairing.rescheduleRequest).toEqual({ requestedBy: 'e1', newTime: '2026-09-05T10:00:00Z' });
    expect(pairing.state).toBe('Ready'); // stays Ready — a pending flag, not a transition
  });

  test('invalid: cannot request a reschedule before a time is even agreed (still Negotiating)', () => {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    const { code } = PairingLifecycle.requestReschedule(p, 'e1', '2026-09-05T10:00:00Z');
    expect(code).toBe('INVALID_STATE');
  });

  test('invalid: a non-participant cannot request a reschedule', () => {
    const p = readyPairingBothChecking();
    const { code } = PairingLifecycle.requestReschedule(p, 'stranger', '2026-09-05T10:00:00Z');
    expect(code).toBe('NOT_A_PARTICIPANT');
  });

  test('a non-organizer cannot approve a reschedule (written first, per the room-quota bug class this repo already hit twice)', () => {
    const p = readyPairingBothChecking();
    PairingLifecycle.requestReschedule(p, 'e1', '2026-09-05T10:00:00Z');
    const before = JSON.stringify(p);
    const { error, code } = PairingLifecycle.approveReschedule(p, 'intruder', 'org-1');
    expect(code).toBe('ORGANIZER_ONLY');
    expect(error).toBeTruthy();
    expect(JSON.stringify(p)).toBe(before);
  });

  test('a non-organizer cannot deny a reschedule either', () => {
    const p = readyPairingBothChecking();
    PairingLifecycle.requestReschedule(p, 'e1', '2026-09-05T10:00:00Z');
    const { code } = PairingLifecycle.denyReschedule(p, 'intruder', 'org-1');
    expect(code).toBe('ORGANIZER_ONLY');
  });

  test('organizer approval changes agreedTime but leaves the original deadline untouched (minor implementation call)', () => {
    const p = readyPairingBothChecking();
    const deadlineBefore = p.deadline;
    PairingLifecycle.requestReschedule(p, 'e1', '2026-09-05T10:00:00Z');
    const { pairing, error } = PairingLifecycle.approveReschedule(p, 'org-1', 'org-1');
    expect(error).toBeUndefined();
    expect(pairing.agreedTime).toBe('2026-09-05T10:00:00Z');
    expect(pairing.deadline).toBe(deadlineBefore);
    expect(pairing.rescheduleRequest).toBeNull();
  });

  test('organizer denial leaves agreedTime unchanged and clears the request', () => {
    const p = readyPairingBothChecking();
    const agreedBefore = p.agreedTime;
    PairingLifecycle.requestReschedule(p, 'e1', '2026-09-05T10:00:00Z');
    const { pairing } = PairingLifecycle.denyReschedule(p, 'org-1', 'org-1');
    expect(pairing.agreedTime).toBe(agreedBefore);
    expect(pairing.rescheduleRequest).toBeNull();
  });

  test('approving with no pending request is rejected', () => {
    const p = readyPairingBothChecking();
    const { code } = PairingLifecycle.approveReschedule(p, 'org-1', 'org-1');
    expect(code).toBe('NO_PENDING_REQUEST');
  });
});

describe('markReady (Ready -> InProgress)', () => {
  test('one player ready: stays Ready, bothReady=false, no timer yet', () => {
    const p = readyPairingBothChecking();
    const { pairing, bothReady, timer } = PairingLifecycle.markReady(p, 'e1', TIME_CONTROL);
    expect(pairing.state).toBe('Ready');
    expect(bothReady).toBe(false);
    expect(timer).toBeUndefined();
  });

  test('marking the same player ready twice does not double-count', () => {
    const p = readyPairingBothChecking();
    PairingLifecycle.markReady(p, 'e1', TIME_CONTROL);
    PairingLifecycle.markReady(p, 'e1', TIME_CONTROL);
    expect(p.readyPlayers.size).toBe(1);
  });

  test('both players ready: InProgress, a TimerManager instance is created', () => {
    const p = readyPairingBothChecking();
    PairingLifecycle.markReady(p, 'e1', TIME_CONTROL);
    const { pairing, bothReady, timer } = PairingLifecycle.markReady(p, 'e2', TIME_CONTROL);
    expect(pairing.state).toBe('InProgress');
    expect(bothReady).toBe(true);
    expect(timer).toBeDefined();
    expect(timer.mode).toBe('per_move');
    expect(timer.initialSeconds).toBe(60);
    timer.destroy(); // no leaked interval from this test
  });

  test('invalid: cannot check in before a time is agreed (still Negotiating)', () => {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    const { code } = PairingLifecycle.markReady(p, 'e1', TIME_CONTROL);
    expect(code).toBe('INVALID_STATE');
  });

  test('invalid: a non-participant cannot check in', () => {
    const p = readyPairingBothChecking();
    const { code } = PairingLifecycle.markReady(p, 'stranger', TIME_CONTROL);
    expect(code).toBe('NOT_A_PARTICIPANT');
  });
});

// ── Deadline resolution branch (decisions 1 & 5) ────────────────────────

describe('resolveDeadline', () => {
  test('exactly one player ready at deadline -> Walkover, present player wins, no further penalty', () => {
    const p = readyPairingBothChecking();
    PairingLifecycle.markReady(p, 'e1', TIME_CONTROL);
    const { pairing, action, winnerEntryId, absentEntryId } = PairingLifecycle.resolveDeadline(p);
    expect(action).toBe('walkover');
    expect(pairing.state).toBe('Walkover');
    expect(winnerEntryId).toBe('e1');
    expect(absentEntryId).toBe('e2');
    expect(pairing.result).toEqual({ winnerEntryId: 'e1', reason: 'walkover' });
    // Punishment = round loss only (decision 1): assert nothing else on the
    // pairing changed beyond state/result/endedAt — no extra penalty field.
    expect(Object.keys(pairing).sort()).toEqual(
      Object.keys(freshPairing()).sort()
    );
  });

  test('zero players ready at deadline (never negotiated) -> DoubleNoShow, resolved as void/replay, not double walkover', () => {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    const { action, pairing } = PairingLifecycle.resolveDeadline(p);
    expect(action).toBe('void_replay');
    expect(pairing.state).toBe('DoubleNoShow');
    expect(pairing.result.winnerEntryId).toBeNull();
  });

  test('zero players ready at deadline (agreed a time but neither checked in) -> also void/replay', () => {
    const p = readyPairingBothChecking();
    const { action } = PairingLifecycle.resolveDeadline(p);
    expect(action).toBe('void_replay');
  });

  test('Reported + disputed, unresolved at deadline -> flagged overdue, forced organizer resolution needed', () => {
    const p = freshPairing();
    PairingLifecycle.announcePairing(p);
    PairingLifecycle.reportTime(p, 'e1', '2026-09-01T10:00:00Z');
    PairingLifecycle.disputeTime(p, 'e2');
    const { action, pairing } = PairingLifecycle.resolveDeadline(p);
    expect(action).toBe('forced_organizer_resolution_needed');
    expect(pairing.overdue).toBe(true);
    expect(pairing.state).toBe('Reported'); // stays — no automatic outcome
  });

  test('a pairing already InProgress is left alone (sweep should never hold its deadline, but defensive no-op)', () => {
    const p = readyPairingBothChecking();
    PairingLifecycle.markReady(p, 'e1', TIME_CONTROL);
    const { timer } = PairingLifecycle.markReady(p, 'e2', TIME_CONTROL);
    const { action } = PairingLifecycle.resolveDeadline(p);
    expect(action).toBe('none');
    expect(p.state).toBe('InProgress');
    timer.destroy();
  });

  test('a terminal pairing (Completed) is left alone', () => {
    const p = freshPairing({ player2EntryId: null }); // bye -> already Completed
    const { action } = PairingLifecycle.resolveDeadline(p);
    expect(action).toBe('none');
  });
});
