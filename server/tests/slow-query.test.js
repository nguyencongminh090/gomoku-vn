'use strict';

/** slow-query.test.js — statement timing on the game thread (B384). */

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const logger = require('../utils/logger');
const slow = require('../db/slow-query');
const { db } = require('../db/connection'); // installs the wrapper

beforeEach(() => { slow.reset(); slow.setThreshold(5); logger.warn.mockClear(); });
afterAll(() => slow.setThreshold(5));

describe('record()', () => {
  test.each([[4.99, false], [5, true], [50, true]])('%p ms against a 5 ms threshold → slow=%p', (ms, isSlow) => {
    expect(slow.record('SELECT 1', 'get', ms, 1e6)).toBe(isSlow);
    expect(logger.warn).toHaveBeenCalledTimes(isSlow ? 1 : 0);
  });

  test('logs ms, kind and whitespace-collapsed SQL capped at 300 chars', () => {
    slow.record('SELECT\n   a\n FROM t ' + 'x'.repeat(400), 'all', 12.345, 1e6);
    const [msg, f] = logger.warn.mock.calls[0];
    expect(msg).toBe('[DB] slow query');
    expect(f).toMatchObject({ ms: 12.3, kind: 'all' });
    expect(f.sql.startsWith('SELECT a FROM t x')).toBe(true);
    expect(f.sql.length).toBe(300);
  });

  test('a hot slow statement logs once per window but every call is counted', () => {
    for (let i = 0; i < 5; i++) slow.record('Q', 'get', 9, 1e6 + i);
    slow.record('Q', 'get', 9, 1e6 + slow.LOG_EVERY_MS); // next window
    slow.record('OTHER', 'get', 9, 1e6);                 // another statement is not silenced by Q
    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(slow.stats().find((s) => s.sql === 'Q')).toMatchObject({ n: 6, slow: 6, maxMs: 9, totalMs: 54 });
  });

  test('threshold 0 disables logging, totals still kept', () => {
    slow.setThreshold(0);
    expect(slow.record('Q', 'get', 500, 1e6)).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(slow.stats()[0]).toMatchObject({ sql: 'Q', n: 1, maxMs: 500 });
  });

  test('totals are capped at MAX_TRACKED distinct statements; an untracked slow one is still logged', () => {
    for (let i = 0; i < slow.MAX_TRACKED + 10; i++) slow.record('Q' + i, 'get', 0.1, 1e6);
    expect(slow.stats(1e6)).toHaveLength(slow.MAX_TRACKED);
    expect(slow.record('brand new', 'get', 99, 1e6)).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test('stats() sorts by worst call and reports the average', () => {
    slow.record('A', 'get', 1, 1e6); slow.record('A', 'get', 3, 1e6); slow.record('B', 'all', 2, 1e6);
    expect(slow.stats().map((s) => [s.sql, s.maxMs, s.avgMs])).toEqual([['A', 3, 2], ['B', 2, 2]]);
  });
});

describe('installed wrapper', () => {
  test('get / all / run on the shared connection are timed and still return their results', () => {
    db.exec('CREATE TABLE IF NOT EXISTS sq_t (a INTEGER)');
    slow.reset();
    expect(db.prepare('INSERT INTO sq_t (a) VALUES (?)').run(7).changes).toBe(1);
    expect(db.prepare('SELECT a FROM sq_t WHERE a = ?').get(7)).toEqual({ a: 7 });
    expect(db.prepare('SELECT a FROM sq_t').all()).toEqual([{ a: 7 }]);
    const seen = slow.stats(50).map((s) => s.sql);
    expect(seen).toEqual(expect.arrayContaining(['INSERT INTO sq_t (a) VALUES (?)', 'SELECT a FROM sq_t WHERE a = ?', 'SELECT a FROM sq_t']));
  });

  test('a throwing statement is still recorded and the error propagates', () => {
    db.exec('CREATE TABLE IF NOT EXISTS sq_u (a INTEGER PRIMARY KEY)');
    const ins = db.prepare('INSERT INTO sq_u (a) VALUES (1)');
    ins.run(); slow.reset();
    expect(() => ins.run()).toThrow(/UNIQUE|PRIMARY/);
    expect(slow.stats()[0]).toMatchObject({ sql: 'INSERT INTO sq_u (a) VALUES (1)', n: 1 });
  });

  test('everything below the threshold stays silent', () => {
    slow.setThreshold(60_000);
    db.prepare('SELECT 1').get();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
