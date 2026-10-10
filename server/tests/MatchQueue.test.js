'use strict';

/**
 * MatchQueue.test.js — quick-match pairing (B197, R3). Pure: the clock is injected.
 */

const { MatchQueue, ratingWindow, PRESETS, bucketKey } = require('../managers/MatchQueue');

function queue() {
  let now = 0;
  const q = new MatchQueue({ now: () => now });
  return { q, advance: (ms) => { now += ms; }, set: (ms) => { now = ms; } };
}
const entry = (userId, extra = {}) => ({ userId, displayName: userId, socketId: 's-' + userId, rule: 'caro', time: '5+3', rated: true, rating: 1500, ...extra });

describe('ratingWindow()', () => {
  it.each([
    [0, 100], [4999, 100], [5000, 150], [10000, 200], [29999, 350], [30000, Infinity], [120000, Infinity],
  ])('waited %i ms → ±%s', (ms, w) => expect(ratingWindow(ms)).toBe(w));
});

describe('PRESETS / bucketKey', () => {
  it('maps the mockup chips to blitz clocks', () => {
    expect(PRESETS).toEqual({
      '1+0': { timerMode: 'blitz', timerSeconds: 60, timerIncrementSeconds: 0 },
      '3+2': { timerMode: 'blitz', timerSeconds: 180, timerIncrementSeconds: 2 },
      '5+3': { timerMode: 'blitz', timerSeconds: 300, timerIncrementSeconds: 3 },
      '10+0': { timerMode: 'blitz', timerSeconds: 600, timerIncrementSeconds: 0 },
    });
  });
  it('rated and casual never share a bucket', () => {
    expect(bucketKey({ rule: 'caro', time: '5+3', rated: true })).not.toBe(bucketKey({ rule: 'caro', time: '5+3', rated: false }));
  });
});

describe('counts() (lobby "N đang chờ", B210)', () => {
  it('groups waiters by rule|time, rated and casual together; empty queue → {}', () => {
    const { q } = queue();
    expect(q.counts()).toEqual({});
    q.join(entry('a'));
    q.join(entry('b', { rated: false }));
    q.join(entry('c', { time: '3+2' }));
    q.join(entry('d', { rule: 'standard' }));
    expect(q.counts()).toEqual({ 'caro|5+3': 2, 'caro|3+2': 1, 'standard|5+3': 1 });
    q.leave('b');
    expect(q.counts()['caro|5+3']).toBe(1);
  });
});

describe('join / leave', () => {
  it('validates rule, time and rated; guests cannot queue rated', () => {
    const { q } = queue();
    expect(q.join(entry('a', { rule: 'renju' })).code).toBe('BAD_RULE');
    expect(q.join(entry('a', { time: '2+1' })).code).toBe('BAD_TIME');
    expect(q.join(entry('a', { rated: true, isGuest: true })).code).toBe('RATED_NEEDS_ACCOUNT');
    expect(q.join(entry('a', { rated: false, isGuest: true })).ok).toBe(true);
    expect(q.size()).toBe(1);
  });

  it('re-joining replaces the entry (new bucket, fresh wait); leave removes it', () => {
    const { q, advance } = queue();
    q.join(entry('a'));
    advance(10000);
    q.join(entry('a', { time: '1+0' }));
    expect(q.size()).toBe(1);
    expect(q.get('a')).toMatchObject({ time: '1+0', since: 10000 });
    expect(q.leave('a')).toBe(true);
    expect(q.leave('a')).toBe(false);
    expect(q.size()).toBe(0);
  });

  it('countIn() counts the bucket only', () => {
    const { q } = queue();
    q.join(entry('a')); q.join(entry('b')); q.join(entry('c', { time: '1+0' }));
    expect(q.countIn(q.get('a'))).toBe(2);
    expect(q.countIn(q.get('c'))).toBe(1);
  });
});

describe('pairing', () => {
  it('pairs two close ratings in the same bucket and removes both', () => {
    const { q } = queue();
    q.join(entry('a', { rating: 1500 })); q.join(entry('b', { rating: 1580 }));
    const pairs = q.pair();
    expect(pairs.map((p) => p.map((e) => e.userId))).toEqual([['a', 'b']]);
    expect(q.size()).toBe(0);
  });

  it('different bucket (rule / time / rated) never pairs', () => {
    const { q, advance } = queue();
    q.join(entry('a')); q.join(entry('b', { rule: 'standard' })); q.join(entry('c', { time: '1+0' })); q.join(entry('d', { rated: false }));
    advance(60000);
    expect(q.pair()).toEqual([]);
    expect(q.size()).toBe(4);
  });

  it('rated: too far apart waits; window widens with the OLDER entry\'s wait', () => {
    const { q, advance } = queue();
    q.join(entry('a', { rating: 1500 }));
    advance(4000);
    q.join(entry('b', { rating: 1660 })); // 160 apart
    expect(q.pair()).toEqual([]);
    advance(6000); // a waited 10 s → ±200
    expect(q.pair().map((p) => p.map((e) => e.userId))).toEqual([['a', 'b']]);
  });

  it('rated: after 30 s anyone in the bucket is fair game', () => {
    const { q, advance } = queue();
    q.join(entry('a', { rating: 1000 })); q.join(entry('b', { rating: 2400 }));
    advance(29999);
    expect(q.pair()).toEqual([]);
    advance(1);
    expect(q.pair()).toHaveLength(1);
  });

  it('casual ignores rating: FIFO', () => {
    const { q, advance } = queue();
    q.join(entry('a', { rated: false, rating: 1000 })); advance(1);
    q.join(entry('b', { rated: false, rating: 2400 }));
    expect(q.pair()).toHaveLength(1);
  });

  it('oldest waiter is served first, with its closest-rated candidate', () => {
    const { q, advance } = queue();
    q.join(entry('old', { rating: 1500 })); advance(1000);
    q.join(entry('far', { rating: 1590 })); advance(1000);
    q.join(entry('near', { rating: 1510 })); advance(1000);
    q.join(entry('x', { rating: 1595 }));
    const pairs = q.pair().map((p) => p.map((e) => e.userId));
    expect(pairs).toEqual([['old', 'near'], ['far', 'x']]);
  });

  it('three in a bucket → one pair, one left waiting', () => {
    const { q } = queue();
    q.join(entry('a')); q.join(entry('b')); q.join(entry('c'));
    expect(q.pair()).toHaveLength(1);
    expect(q.size()).toBe(1);
  });

  it('a pairing veto (e.g. now in a room) drops that entry and keeps looking', () => {
    const { q } = queue();
    q.join(entry('a')); q.join(entry('busy')); q.join(entry('c'));
    const pairs = q.pair((e) => e.userId !== 'busy');
    expect(pairs.map((p) => p.map((e) => e.userId))).toEqual([['a', 'c']]);
    expect(q.get('busy')).toBeNull();
    expect(q.size()).toBe(0);
  });

  it('empty / single queue → no pairs', () => {
    const { q } = queue();
    expect(q.pair()).toEqual([]);
    q.join(entry('a'));
    expect(q.pair()).toEqual([]);
  });

  it('estimates(): median recent wait per rule|time, hidden until 3 samples (B210)', () => {
    const { q, advance } = queue();
    const pairWaiting = (a, b, ms) => { q.join(entry(a)); advance(ms); q.join(entry(b)); q.pair(); };
    pairWaiting('a', 'b', 4000); // waits 4s (a) and 0s→1s floor (b)
    expect(q.estimates()).toEqual({}); // 2 samples
    pairWaiting('c', 'd', 10000); // + 10s, 1s
    const key = Object.keys(q.estimates())[0];
    expect(q.estimates()[key]).toBe(4); // sorted [1,1,4,10] → index 2
    expect(typeof key).toBe('string');
  });
});
