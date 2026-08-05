'use strict';

/**
 * tournamentDeadlineSweep.test.js — Unit tests for the deadline-sweep
 * mechanics in server/socket/tournamentState.js (Phase 3, TODO.md #48,
 * design answer (b): one setInterval scanning a pendingDeadlines Map,
 * not one timer per pairing).
 *
 * Mirrors RoomManager.test.js's convention exactly: fake timers installed
 * BEFORE requiring the module (its setInterval starts at require time), and
 * config mocked with a sentinel scan interval distinct from the real
 * default so this is a genuine regression guard, not a tautology.
 */

jest.useFakeTimers();

const SENTINEL_SCAN_MS = 54_321;

jest.mock('../config', () => ({
  ...jest.requireActual('../config'),
  TOURNAMENT_DEADLINE_SCAN_INTERVAL_MS: 54_321,
}));

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const setIntervalSpy = jest.spyOn(global, 'setInterval');

const tournamentState = require('../socket/tournamentState');

describe('tournamentState — deadline sweep cadence', () => {
  test('the sweep interval is scheduled from config, not a literal', () => {
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), SENTINEL_SCAN_MS);
  });

  test('each elapsed interval triggers exactly one sweep', () => {
    const sweep = jest.spyOn(tournamentState, '_sweep');
    try {
      jest.advanceTimersByTime(SENTINEL_SCAN_MS - 1);
      expect(sweep).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(sweep).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(SENTINEL_SCAN_MS * 3);
      expect(sweep).toHaveBeenCalledTimes(4);
    } finally {
      sweep.mockRestore();
    }
  });
});

describe('tournamentState — pendingDeadlines bookkeeping', () => {
  beforeEach(() => {
    tournamentState.pendingDeadlines.clear();
    tournamentState.setDeadlineHandler(null);
  });

  test('trackDeadline registers a pairing; untrackDeadline removes it', () => {
    tournamentState.trackDeadline('p1', 't1', Date.now() + 10_000);
    expect(tournamentState.pendingDeadlines.has('p1')).toBe(true);
    tournamentState.untrackDeadline('p1');
    expect(tournamentState.pendingDeadlines.has('p1')).toBe(false);
  });

  test('a sweep with zero pending deadlines is a cheap no-op — does not throw, does not call the handler', () => {
    const handler = jest.fn();
    tournamentState.setDeadlineHandler(handler);
    expect(() => tournamentState._sweep()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  test('the sweep calls the deadline handler for every pairing whose deadline has passed', () => {
    const handler = jest.fn();
    tournamentState.setDeadlineHandler(handler);
    const now = Date.now();
    tournamentState.trackDeadline('overdue-1', 't1', now - 1000); // already passed
    tournamentState.trackDeadline('overdue-2', 't2', now - 1); // already passed
    tournamentState.trackDeadline('not-yet', 't1', now + 60_000); // not yet

    tournamentState._sweep();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith('overdue-1', 't1');
    expect(handler).toHaveBeenCalledWith('overdue-2', 't2');
    expect(handler).not.toHaveBeenCalledWith('not-yet', expect.anything());
  });

  test('a sweep with no handler installed does nothing (no throw)', () => {
    tournamentState.trackDeadline('p1', 't1', Date.now() - 1000);
    expect(() => tournamentState._sweep()).not.toThrow();
  });

  test('trackDeadline overwrites a prior entry for the same pairingId rather than duplicating it', () => {
    tournamentState.trackDeadline('p1', 't1', Date.now() + 1000);
    tournamentState.trackDeadline('p1', 't1', Date.now() + 5000);
    expect(tournamentState.pendingDeadlines.size).toBe(1);
  });

  test('untracking a pairing that was never tracked is a safe no-op', () => {
    expect(() => tournamentState.untrackDeadline('never-tracked')).not.toThrow();
  });
});

describe('tournamentState — tournamentTimerMap', () => {
  test('starts empty', () => {
    expect(tournamentState.tournamentTimerMap.size).toBe(0);
  });
});
