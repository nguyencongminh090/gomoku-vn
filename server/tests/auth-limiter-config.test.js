'use strict';

/**
 * auth-limiter-config.test.js — AUTH_LIMITER_MAX env override (TODO.md #141).
 *
 * Same override pattern as MAX_ROOMS_PER_IP (see room-capacity-config.test.js):
 * the e2e harness needs to raise authLimiter's 20-req/15min/IP budget for a
 * run without editing this tracked file, while production (unset env) still
 * gets the literal default.
 */

function loadConfigWith(env) {
  const saved = {};
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  jest.resetModules();
  // eslint-disable-next-line global-require
  const config = require('../config');
  for (const key of Object.keys(saved)) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  return config;
}

describe('AUTH_LIMITER_MAX config', () => {
  test('defaults to 20 when unset (production behaviour)', () => {
    const config = loadConfigWith({ AUTH_LIMITER_MAX: undefined });
    expect(config.AUTH_LIMITER_MAX).toBe(20);
  });

  test('honours an explicit AUTH_LIMITER_MAX override', () => {
    const config = loadConfigWith({ AUTH_LIMITER_MAX: '200' });
    expect(config.AUTH_LIMITER_MAX).toBe(200);
  });

  test('falls back to the default when the env value is not a number', () => {
    const config = loadConfigWith({ AUTH_LIMITER_MAX: 'not-a-number' });
    expect(config.AUTH_LIMITER_MAX).toBe(20);
  });
});
