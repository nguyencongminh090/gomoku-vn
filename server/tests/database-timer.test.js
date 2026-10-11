'use strict';

/**
 * database-timer.test.js — the hourly WAL checkpoint timer must not keep the process alive.
 * Before the fix, any test or script that loaded db/database.js hung after finishing
 * ("Jest did not exit"; `node -e "require('./server/db/database')"` never returned).
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

it('WAL checkpoint interval is unref()ed', () => {
  const real = global.setInterval;
  const timers = [];
  global.setInterval = (...args) => { const h = real(...args); timers.push(h); return h; };
  try {
    require('../db/database');
  } finally {
    global.setInterval = real;
  }
  expect(timers.length).toBeGreaterThan(0);
  for (const h of timers) {
    expect(h.hasRef()).toBe(false);
    clearInterval(h);
  }
});
