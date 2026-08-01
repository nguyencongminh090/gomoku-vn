'use strict';

/**
 * RoomManager.test.js — Unit tests for RoomManager.
 *
 * Currently covers the idle-scan interval only: that the scan cadence comes
 * from config rather than a literal in the constructor, and that the interval
 * actually drives _idleCleanup.
 *
 * config is mocked with a SENTINEL scan interval deliberately different from
 * the real 60_000. Asserting against the real value would pass even with the
 * old hard-coded literal still in place — the sentinel is what makes this a
 * real regression guard rather than a tautology.
 *
 * Fake timers are installed before requiring RoomManager, because its
 * constructor starts the cleanup interval at require time (it is a singleton).
 */

jest.useFakeTimers();

const SENTINEL_SCAN_MS = 12_345;

jest.mock('../config', () => ({
  ...jest.requireActual('../config'),
  IDLE_SCAN_INTERVAL_MS: 12_345,
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const setIntervalSpy = jest.spyOn(global, 'setInterval');

const realConfig = jest.requireActual('../config');
const roomManager = require('../managers/RoomManager');

describe('RoomManager — idle scan cadence', () => {
  test('the cleanup interval is scheduled from config, not a literal', () => {
    expect(setIntervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      SENTINEL_SCAN_MS
    );
  });

  test('each elapsed interval triggers exactly one idle sweep', () => {
    const sweep = jest.spyOn(roomManager, '_idleCleanup').mockImplementation(() => {});
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

describe('config — idle scan interval', () => {
  test('the real value is a positive number', () => {
    expect(typeof realConfig.IDLE_SCAN_INTERVAL_MS).toBe('number');
    expect(realConfig.IDLE_SCAN_INTERVAL_MS).toBeGreaterThan(0);
  });

  test('the scan runs more often than the timeout it enforces', () => {
    // A scan cadence at or above IDLE_TIMEOUT_MS would let an idle room live
    // for up to twice the timeout before anything noticed it.
    expect(realConfig.IDLE_SCAN_INTERVAL_MS).toBeLessThan(realConfig.IDLE_TIMEOUT_MS);
  });
});
