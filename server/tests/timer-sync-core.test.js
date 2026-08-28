'use strict';

/**
 * timer-sync-core.test.js — Unit tests for client/js/timer-sync-core.js.
 *
 * Pure maths, no DOM: require()-able straight from Node, same arrangement as
 * escape-utils.test.js.
 *
 * These functions were extracted verbatim from room-socket.js/game-ui.js
 * (TODO.md #168 step 1), so the cases below are written against the behaviour
 * the ROOM already shipped under #165/#166 — a failure here means the room's
 * clock changed, not just that a helper changed.
 */

const core = require('../../client/js/timer-sync-core');

describe('halfRttEma — rolling half round-trip estimate', () => {
  test('the first accepted sample is simply half the round-trip, rounded', () => {
    expect(core.halfRttEma(0, 400)).toBe(200);
    expect(core.halfRttEma(undefined, 401)).toBe(201); // 200.5 → 201
  });

  test('later samples blend 50/50 with the previous estimate', () => {
    // 200 * 0.5 + (600/2) * 0.5 = 100 + 150 = 250
    expect(core.halfRttEma(200, 600)).toBe(250);
  });

  test('the blend is rounded to a whole millisecond, not left fractional', () => {
    // 101 * 0.5 + (401/2) * 0.5 = 50.5 + 100.25 = 150.75 → 151
    expect(core.halfRttEma(101, 401)).toBe(151);
  });

  test('a converged estimate stays put when the network does', () => {
    expect(core.halfRttEma(300, 600)).toBe(300);
  });

  test.each([
    ['negative round-trip (clock went backwards)', -1],
    ['NaN', NaN],
    ['undefined', undefined],
    ['a non-numeric string', 'slow'],
    ['above the 30s stall ceiling', 30001],
  ])('rejects %s by returning null, leaving the caller\'s estimate untouched', (_label, sample) => {
    expect(core.halfRttEma(250, sample)).toBeNull();
  });

  test('quirk, preserved from the room: `null` is accepted as a 0ms sample', () => {
    // `null >= 0` is true in JS, so the pre-#168 guard let null through and
    // averaged it in as zero. Faithful extraction means keeping that — the
    // room has shipped this since #165 and no caller passes null anyway
    // (game-ui.js only ever passes `Date.now() - sentAt`). Documented here so
    // a future reader sees it is deliberate, not an oversight in the guard.
    expect(core.halfRttEma(250, null)).toBe(125);
  });

  test('boundaries of the stall ceiling: 30000 is a sample, 30001 is a stall', () => {
    expect(core.halfRttEma(0, core.RTT_SAMPLE_MAX_MS)).toBe(15000);
    expect(core.halfRttEma(0, core.RTT_SAMPLE_MAX_MS + 1)).toBeNull();
  });

  test('zero is a legitimate measurement (loopback), not a rejection', () => {
    // Distinct from null: a 0ms round-trip is a real reading on localhost.
    expect(core.halfRttEma(0, 0)).toBe(0);
    expect(core.halfRttEma(200, 0)).toBe(100);
  });
});

describe('transitDelaySec — one-way delay used to shave the display', () => {
  test('is half-RTT expressed in seconds', () => {
    expect(core.transitDelaySec(500)).toBe(0.5);
    expect(core.transitDelaySec(1500)).toBe(1.5);
  });

  test.each([
    ['no estimate yet (0)', 0],
    ['undefined', undefined],
    ['null', null],
  ])('%s compensates nothing', (_label, halfRtt) => {
    expect(core.transitDelaySec(halfRtt)).toBe(0);
  });

  test('clamps at 8s so a pathological estimate cannot eat a visible clock', () => {
    expect(core.transitDelaySec(core.TRANSIT_CLAMP_MS)).toBe(8);
    expect(core.transitDelaySec(core.TRANSIT_CLAMP_MS - 1)).toBeCloseTo(7.999, 3);
    expect(core.transitDelaySec(core.TRANSIT_CLAMP_MS + 1)).toBe(8);
    expect(core.transitDelaySec(60000)).toBe(8);
  });
});

describe('compensatedRemainingSec — what the active player actually sees', () => {
  const now = 1_000_000;

  test('with no latency estimate it is the plain remaining time', () => {
    expect(core.compensatedRemainingSec(now + 30000, now, 0)).toBe(30);
  });

  test('subtracts the one-way delay the sync packet spent in flight', () => {
    // 30s left, 1000ms half-RTT → the server is already 1s further along.
    expect(core.compensatedRemainingSec(now + 30000, now, 1000)).toBe(29);
  });

  test('rounds the compensated value rather than truncating it', () => {
    // A 500ms half-RTT is a 0.5s shave (the argument is already halved).
    // 30.4 - 0.5 = 29.9 → 30. Truncation would have shown 29.
    expect(core.compensatedRemainingSec(now + 30400, now, 500)).toBe(30);
    // 30.8 - 0.5 = 30.3 → 30
    expect(core.compensatedRemainingSec(now + 30800, now, 500)).toBe(30);
    // 31.2 - 0.5 = 30.7 → 31
    expect(core.compensatedRemainingSec(now + 31200, now, 500)).toBe(31);
  });

  test('never returns a negative — the server, not this, decides the timeout', () => {
    expect(core.compensatedRemainingSec(now - 5000, now, 0)).toBe(0);
    // Compensation alone must not push a live clock below zero either.
    expect(core.compensatedRemainingSec(now + 200, now, 8000)).toBe(0);
  });

  test('a past deadline with a huge estimate still floors at 0, not NaN', () => {
    expect(core.compensatedRemainingSec(now - 60000, now, 60000)).toBe(0);
  });

  test('honours the same 8s clamp as transitDelaySec', () => {
    // A 60s estimate would otherwise shave 30s off; the clamp holds it to 8.
    expect(core.compensatedRemainingSec(now + 30000, now, 60000)).toBe(22);
  });
});

describe('displayShaveSec — whole-second shave applied at sync time', () => {
  test('is transitDelaySec rounded to a whole second', () => {
    expect(core.displayShaveSec(0)).toBe(0);
    expect(core.displayShaveSec(400)).toBe(0);   // 0.4 → 0
    expect(core.displayShaveSec(500)).toBe(1);   // 0.5 → 1
    expect(core.displayShaveSec(1600)).toBe(2);  // 1.6 → 2
  });

  test('clamped like every other consumer of the estimate', () => {
    expect(core.displayShaveSec(60000)).toBe(8);
  });
});

describe('clockOffsetMs — skew between the server clock and this device', () => {
  test('positive when our device runs behind the server', () => {
    expect(core.clockOffsetMs(1_000_500, 1_000_000)).toBe(500);
  });

  test('negative when our device runs ahead of the server', () => {
    expect(core.clockOffsetMs(999_500, 1_000_000)).toBe(-500);
  });

  test('a missing server reading means no offset, never NaN', () => {
    // The room falls back to Date.now() for both halves in that case.
    expect(core.clockOffsetMs(undefined, 1_000_000)).toBe(0);
    expect(core.clockOffsetMs(null, 1_000_000)).toBe(0);
    expect(core.clockOffsetMs(0, 1_000_000)).toBe(0);
  });

  test('keeps pure skew semantics — transit delay is NOT folded in here', () => {
    // The room's watchdog reads serverNow() built from this offset; if this
    // ever started subtracting transit delay, that watchdog would fire early.
    const withLatency = core.clockOffsetMs(1_000_500, 1_000_000);
    expect(withLatency).toBe(500);
    expect(withLatency).not.toBe(500 - core.transitDelaySec(1000) * 1000);
  });
});

describe('room-parity: the extracted maths reproduces the pre-#168 expressions', () => {
  // Literal transcription of what room-socket.js/game-ui.js ran before the
  // extraction. If a future edit to the core drifts from the room's shipped
  // behaviour, this fails even when every test above still passes.
  const oldRecordMoveRtt = (prev, rttMs) => {
    if (!(rttMs >= 0) || rttMs > 30000) return prev;
    const half = rttMs / 2;
    return prev ? Math.round(prev * 0.5 + half * 0.5) : Math.round(half);
  };
  const oldTransitDelaySec = (halfRttMs) => {
    const halfRtt = halfRttMs ? halfRttMs : 0;
    return Math.min(halfRtt, 8000) / 1000;
  };
  const oldRemaining = (deadline, serverNow, halfRttMs) =>
    Math.max(0, Math.round((deadline - serverNow) / 1000 - oldTransitDelaySec(halfRttMs)));

  const rtts = [0, 1, 37, 199, 200, 401, 999, 1000, 5000, 16000, 29999, 30000, 30001, -1, NaN];
  const prevs = [0, 1, 120, 250, 999, 8000, 20000];

  test('halfRttEma matches the old recordMoveRtt for every sample/state pair', () => {
    for (const prev of prevs) {
      for (const rtt of rtts) {
        const next = core.halfRttEma(prev, rtt);
        // null means "leave it alone", which is what the old code's early
        // return did — so compare against `prev` in that case.
        expect(next === null ? prev : next).toBe(oldRecordMoveRtt(prev, rtt));
      }
    }
  });

  test('transitDelaySec matches the old inline expression', () => {
    for (const halfRtt of [0, 1, 250, 7999, 8000, 8001, 30000]) {
      expect(core.transitDelaySec(halfRtt)).toBe(oldTransitDelaySec(halfRtt));
    }
  });

  test('compensatedRemainingSec matches the old tickLocal expression', () => {
    const now = 1_700_000_000_000;
    for (const left of [-3000, 0, 400, 500, 1000, 9500, 30000, 300000]) {
      for (const halfRtt of [0, 250, 500, 1000, 8000, 30000]) {
        expect(core.compensatedRemainingSec(now + left, now, halfRtt))
          .toBe(oldRemaining(now + left, now, halfRtt));
      }
    }
  });

  test('displayShaveSec matches the old Math.round(transitDelaySec())', () => {
    for (const halfRtt of [0, 400, 500, 1499, 1500, 8000, 30000]) {
      expect(core.displayShaveSec(halfRtt)).toBe(Math.round(oldTransitDelaySec(halfRtt)));
    }
  });

  test('clockOffsetMs matches the old expression whenever serverTime is present', () => {
    const localNow = 1_700_000_000_000;
    for (const skew of [-5000, -1, 0, 1, 250, 5000]) {
      const serverTime = localNow + skew;
      // Old shape, with the second Date.now() standing in as `localNow` —
      // identical here because this branch never reaches the fallback.
      expect(core.clockOffsetMs(serverTime, localNow))
        .toBe((serverTime || localNow) - localNow);
    }
  });

  test('DIVERGENCE: a missing serverTime is exactly 0, where the old double read could drift', () => {
    // Old: `(sync.serverTime || Date.now()) - Date.now()` — two readings, so
    // the fallback could produce -1ms of phantom skew that then biased every
    // serverNow() until the next sync. One reading makes it exactly 0.
    // See the header of timer-sync-core.js.
    const oldDoubleRead = (serverTime) => (serverTime || Date.now()) - Date.now();

    for (const missing of [undefined, null, 0, NaN, '']) {
      expect(core.clockOffsetMs(missing, Date.now())).toBe(0);
      // Not asserting the old function's value (it is timing-dependent by
      // construction — that is the defect); only that ours cannot be negative.
      expect(core.clockOffsetMs(missing, Date.now())).not.toBeLessThan(0);
      expect(Number.isNaN(oldDoubleRead(missing))).toBe(false); // sanity: same shape
    }
  });
});
