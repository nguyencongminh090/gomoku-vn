'use strict';

/**
 * TimerManager.test.js — Unit tests for the server-side game timer.
 *
 * Covers the manual checklist already written in TimerManager.js's header
 * comment (audit finding #9): start/tick, per_move reset, per_game decrement,
 * blitz increment, timeout callback, stop() idempotency, and repeated
 * start/stop cycles not leaking intervals.
 */

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const TimerManager = require('../managers/TimerManager');

function makeTimer(overrides = {}) {
  return new TimerManager({
    roomId: 'room1',
    mode: 'per_move',
    seconds: 10,
    blackPlayerId: 'black-id',
    whitePlayerId: 'white-id',
    onTick: jest.fn(),
    onTimeout: jest.fn(),
    ...overrides,
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('TimerManager — start/tick', () => {
  test('ticks the active color down every second and reports via onTick', () => {
    const onTick = jest.fn();
    const timer = makeTimer({ onTick });
    timer.start();

    jest.advanceTimersByTime(3000);

    expect(timer.black).toBe(7);
    expect(timer.white).toBe(10);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(onTick).toHaveBeenLastCalledWith({ black: 7, white: 10 });
  });

  test('start() is idempotent — calling twice does not double the tick rate', () => {
    const timer = makeTimer();
    timer.start();
    timer.start();

    jest.advanceTimersByTime(1000);

    expect(timer.black).toBe(9);
  });
});

describe('TimerManager — per_move mode', () => {
  test('resets the mover\'s time to initialSeconds and switches the active color on applyMove', () => {
    const timer = makeTimer({ mode: 'per_move' });
    timer.start();
    jest.advanceTimersByTime(4000); // black: 10 -> 6

    timer.switchTurn('white');

    expect(timer.black).toBe(10); // reset
    expect(timer.activeColor).toBe('white');

    jest.advanceTimersByTime(2000); // white ticks now, black must stay frozen
    expect(timer.white).toBe(8);
    expect(timer.black).toBe(10);
  });
});

describe('TimerManager — per_game mode', () => {
  test('does not reset time on a move, only decrements the active player', () => {
    const timer = makeTimer({ mode: 'per_game' });
    timer.start();
    jest.advanceTimersByTime(3000); // black: 10 -> 7

    timer.switchTurn('white');

    expect(timer.black).toBe(7); // NOT reset, unlike per_move
    expect(timer.activeColor).toBe('white');
  });
});

describe('TimerManager — blitz mode', () => {
  test('adds the increment to the mover after a valid move', () => {
    const timer = makeTimer({ mode: 'blitz', seconds: 10, incrementSeconds: 5 });
    timer.start();
    jest.advanceTimersByTime(4000); // black: 10 -> 6

    timer.applyMove('black', 'white');

    expect(timer.black).toBe(11); // 6 + 5 increment
    expect(timer.activeColor).toBe('white');
  });

  test('does not add increment when incrementSeconds is 0', () => {
    const timer = makeTimer({ mode: 'blitz', seconds: 10, incrementSeconds: 0 });
    timer.start();
    jest.advanceTimersByTime(4000);

    timer.applyMove('black', 'white');

    expect(timer.black).toBe(6);
  });
});

describe('TimerManager — timeout', () => {
  test('calls onTimeout with the correct playerId when the active player runs out of time', () => {
    const onTimeout = jest.fn();
    const timer = makeTimer({ seconds: 2, onTimeout });
    timer.start();

    jest.advanceTimersByTime(2000);

    expect(timer.black).toBe(0);
    expect(onTimeout).toHaveBeenCalledWith('black-id');
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  test('stops ticking after timeout — no further onTick calls or negative time', () => {
    const onTick = jest.fn();
    const timer = makeTimer({ seconds: 2, onTick });
    timer.start();

    jest.advanceTimersByTime(2000);
    const callsAtTimeout = onTick.mock.calls.length;
    jest.advanceTimersByTime(5000);

    expect(onTick).toHaveBeenCalledTimes(callsAtTimeout);
    expect(timer.black).toBe(0);
  });

  test('times out the white player when it is their turn', () => {
    const onTimeout = jest.fn();
    const timer = makeTimer({ seconds: 3, onTimeout });
    timer.start();
    timer.switchTurn('white');

    jest.advanceTimersByTime(3000);

    expect(timer.white).toBe(0);
    expect(onTimeout).toHaveBeenCalledWith('white-id');
  });
});

describe('TimerManager — stop()', () => {
  test('clears the interval and prevents further ticks', () => {
    const onTick = jest.fn();
    const timer = makeTimer({ onTick });
    timer.start();
    jest.advanceTimersByTime(2000);
    timer.stop();

    jest.advanceTimersByTime(5000);

    expect(onTick).toHaveBeenCalledTimes(2);
  });

  test('stop() is safe to call when the timer was never started', () => {
    const timer = makeTimer();
    expect(() => timer.stop()).not.toThrow();
  });

  test('multiple start/stop cycles work without leaking extra intervals', () => {
    const onTick = jest.fn();
    const timer = makeTimer({ onTick, seconds: 100 });

    timer.start();
    jest.advanceTimersByTime(2000);
    timer.stop();

    timer.start();
    jest.advanceTimersByTime(2000);
    timer.stop();

    // 2 ticks per cycle x 2 cycles = 4, not 6+ (which would indicate a leaked interval)
    expect(onTick).toHaveBeenCalledTimes(4);
    expect(timer.black).toBe(96);
  });
});

describe('TimerManager — addTime ("Xin Time")', () => {
  test('adds bonus seconds to the requested color without affecting the other', () => {
    const timer = makeTimer();
    timer.addTime('black', 30);

    expect(timer.black).toBe(40);
    expect(timer.white).toBe(10);
  });
});

describe('TimerManager — destroy()', () => {
  test('stops the timer and nulls callback references', () => {
    const timer = makeTimer();
    timer.start();

    timer.destroy();

    expect(timer.onTick).toBeNull();
    expect(timer.onTimeout).toBeNull();
    jest.advanceTimersByTime(5000); // must not throw despite null callbacks
  });
});

// ── Deadline sync (review 4.3) ─────────────────────────────────────────────
//
// The per-second broadcast is gone: onTick above is now server-internal only
// (it keeps the authoritative clock and fires onTimeout), and clients get
// getSync() at each discontinuity and count down themselves. The existing
// start/tick tests above still apply unchanged — the internal tick behaviour
// they cover did not change, only who hears about it.

describe('TimerManager — getSync()', () => {
  test('reports a deadline matching the active player’s remaining time', () => {
    const now = 1_700_000_000_000;
    jest.setSystemTime(now);

    const timer = makeTimer();          // black: 10s, white: 10s, black active
    timer.start();

    const sync = timer.getSync();
    expect(sync.activeColor).toBe('black');
    expect(sync.deadline).toBe(now + 10_000);
    expect(sync.serverTime).toBe(now);
    expect(sync.running).toBe(true);
    expect(sync).toMatchObject({ black: 10, white: 10 });
  });

  test('the deadline moves with the clock as it ticks down', () => {
    const now = 1_700_000_000_000;
    jest.setSystemTime(now);
    const timer = makeTimer();
    timer.start();

    jest.advanceTimersByTime(4000);
    jest.setSystemTime(now + 4000);

    const sync = timer.getSync();
    expect(sync.black).toBe(6);
    // 6s left at t+4s → still the same absolute moment as the original deadline.
    expect(sync.deadline).toBe(now + 10_000);
  });

  test('a turn switch retargets the deadline at the other player', () => {
    const now = 1_700_000_000_000;
    jest.setSystemTime(now);
    const timer = makeTimer({ mode: 'per_game' });
    timer.start();

    jest.advanceTimersByTime(3000);
    jest.setSystemTime(now + 3000);
    timer.switchTurn('white');

    const sync = timer.getSync();
    expect(sync.activeColor).toBe('white');
    expect(sync.white).toBe(10);
    expect(sync.deadline).toBe(now + 3000 + 10_000);
    // The idle player's clock is reported but is not what the deadline tracks.
    expect(sync.black).toBe(7);
  });

  test('bonus time pushes the deadline out by exactly that much', () => {
    const now = 1_700_000_000_000;
    jest.setSystemTime(now);
    const timer = makeTimer();
    timer.start();

    const before = timer.getSync().deadline;
    timer.addTime('black', 30);
    const after = timer.getSync().deadline;

    expect(after - before).toBe(30_000);
  });

  test('a paused clock reports running:false and no deadline', () => {
    const timer = makeTimer();
    timer.start();
    timer.stop();

    const sync = timer.getSync();
    expect(sync.running).toBe(false);
    expect(sync.deadline).toBeNull();
    // The frozen values are still reported, so a client can render them.
    expect(sync.black).toBe(10);
    expect(sync.white).toBe(10);
  });

  test('resuming after a pause issues a fresh deadline from the resume moment', () => {
    const now = 1_700_000_000_000;
    jest.setSystemTime(now);
    const timer = makeTimer();
    timer.start();

    jest.advanceTimersByTime(2000);
    timer.stop();                       // disconnect grace
    jest.setSystemTime(now + 60_000);   // a minute passes while paused
    timer.start();

    const sync = timer.getSync();
    expect(sync.running).toBe(true);
    expect(sync.black).toBe(8);
    // The paused minute is not charged to the player.
    expect(sync.deadline).toBe(now + 60_000 + 8000);
  });

  test('a client counting down from the deadline agrees with the server’s own clock', () => {
    // What the client actually does: remaining = round((deadline - now) / 1000).
    const now = 1_700_000_000_000;
    jest.setSystemTime(now);
    const timer = makeTimer({ mode: 'per_game' });
    timer.start();
    const { deadline } = timer.getSync();

    // Step second by second, keeping the fake wall clock in step with the
    // fake timers, and check the client's arithmetic against the server's
    // authoritative value at every step.
    for (let elapsed = 1000; elapsed <= 9000; elapsed += 1000) {
      jest.advanceTimersByTime(1000);
      jest.setSystemTime(now + elapsed);

      const clientView = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      expect(clientView).toBe(timer.black);
    }
  });
});

describe('no per-second timer broadcast remains', () => {
  const fs = require('fs');
  const path = require('path');

  function jsFilesUnder(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...jsFilesUnder(full));
      else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
  }

  test("no server code emits 'timer:tick' any more", () => {
    const offenders = [];
    for (const file of jsFilesUnder(path.join(__dirname, '..', 'socket'))) {
      const src = fs.readFileSync(file, 'utf8');
      if (src.includes("emit('timer:tick'")) offenders.push(path.basename(file));
    }
    expect(offenders).toEqual([]);
  });

  test('the timer callback wired into the socket layer broadcasts nothing', () => {
    // GameHandler builds TimerManager with an onTick that must stay a no-op —
    // re-adding an emit there would restore the once-per-second traffic.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'socket', 'handlers', 'GameHandler.js'), 'utf8'
    );
    expect(src).toMatch(/onTick:\s*\(\)\s*=>\s*\{\s*\}/);
  });
});
