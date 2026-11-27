'use strict';

/** TODO.md #502 — pure replay helpers (client/js/replay-core.js): think times, deep link. */

const RC = require('../../client/js/replay-core');

describe('moveTimes / durationMs / formatClock', () => {
  it('think time = gap to the previous move; move 1 has none', () => {
    expect(RC.moveTimes([{ timestamp: 1000 }, { timestamp: 4000 }, { timestamp: 4500 }])).toEqual({ has: true, think: [null, 3000, 500] });
  });

  it.each([[[]], [[{ timestamp: 1 }, {}]], [[{ timestamp: 1 }, { timestamp: '2' }]], [[{ timestamp: NaN }]], [null]])(
    'hidden when any move lacks a numeric timestamp: %j', (moves) => {
      expect(RC.moveTimes(moves).has).toBe(false);
    });

  it('duration = ended_at − started_at; missing or reversed → null', () => {
    expect(RC.durationMs({ started_at: '2026-11-20T20:00:00Z', ended_at: '2026-11-20T20:09:30Z' })).toBe(570000);
    expect(RC.durationMs({ started_at: null, ended_at: '2026-11-20T20:09:30Z' })).toBeNull();
    expect(RC.durationMs({ started_at: '2026-11-20T21:00:00Z', ended_at: '2026-11-20T20:00:00Z' })).toBeNull();
  });

  it.each([[0, '0s'], [59400, '59s'], [60000, '1:00'], [187000, '3:07'], [3723000, '1:02:03']])('formatClock(%d) = %s', (ms, s) => {
    expect(RC.formatClock(ms)).toBe(s);
  });
});

describe('parseMoveParam / buildShareUrl', () => {
  it.each([['?move=5', 5], ['?move=0', 0], ['?move=-3', 0], ['?move=999', 41], ['?move=41', 41], ['?source=tournament&move=7', 7]])(
    '%s → %d (total 41)', (q, n) => { expect(RC.parseMoveParam(q, 41)).toBe(n); });

  it.each(['', '?move=', '?move=abc', '?move=3.5', '?other=1'])('%s → null', (q) => {
    expect(RC.parseMoveParam(q, 41)).toBeNull();
  });

  it('builds the link, keeps source=tournament, start = no move param', () => {
    expect(RC.buildShareUrl('https://x.win', 'g 1', { move: 12 })).toBe('https://x.win/replay/g%201?move=12');
    expect(RC.buildShareUrl('https://x.win', 'g1', { source: 'tournament', move: 3 })).toBe('https://x.win/replay/g1?source=tournament&move=3');
    expect(RC.buildShareUrl('https://x.win', 'g1', { source: 'tournament', move: null })).toBe('https://x.win/replay/g1?source=tournament');
    expect(RC.buildShareUrl('https://x.win', 'g1', { move: 0 })).toBe('https://x.win/replay/g1');
  });
});
