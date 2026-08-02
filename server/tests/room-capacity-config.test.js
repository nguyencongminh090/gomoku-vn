'use strict';

/**
 * room-capacity-config.test.js — regression guard for the room-capacity caps
 * raised in TODO.md #31.
 *
 * Why this exists: MAX_ROOMS/MAX_USERS_PER_ROOM (200 total room-members) were
 * always an abuse-prevention choice, not a capacity one — the server itself is
 * verified clean up to ~3000-4000 concurrent players (docs/stress-test-report.md
 * §9-10, TODO.md #27-29). Raised 2026-08-03 to 50/40 (2000 total), still well
 * under that ceiling. This pins the new defaults so a future edit can't
 * silently drift back toward the old, tighter values — same pattern as
 * listen-backlog.test.js for LISTEN_BACKLOG.
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

describe('MAX_ROOMS config', () => {
  test('defaults to 50 (raised from the original 10)', () => {
    const config = loadConfigWith({ MAX_ROOMS: undefined });
    expect(config.MAX_ROOMS).toBe(50);
  });

  test('honours an explicit MAX_ROOMS override', () => {
    const config = loadConfigWith({ MAX_ROOMS: '5' });
    expect(config.MAX_ROOMS).toBe(5);
  });

  test('falls back to the default when the env value is not a number', () => {
    const config = loadConfigWith({ MAX_ROOMS: 'not-a-number' });
    expect(config.MAX_ROOMS).toBe(50);
  });
});

describe('MAX_USERS_PER_ROOM config', () => {
  test('defaults to 40 (raised from the original 20)', () => {
    const config = loadConfigWith({ MAX_USERS_PER_ROOM: undefined });
    expect(config.MAX_USERS_PER_ROOM).toBe(40);
  });

  test('honours an explicit MAX_USERS_PER_ROOM override', () => {
    const config = loadConfigWith({ MAX_USERS_PER_ROOM: '4' });
    expect(config.MAX_USERS_PER_ROOM).toBe(4);
  });

  test('falls back to the default when the env value is not a number', () => {
    const config = loadConfigWith({ MAX_USERS_PER_ROOM: 'not-a-number' });
    expect(config.MAX_USERS_PER_ROOM).toBe(40);
  });
});

describe('MAX_ROOMS_PER_IP config — deliberately left unchanged', () => {
  test('stays at 3, not scaled up alongside MAX_ROOMS', () => {
    const config = loadConfigWith({ MAX_ROOMS_PER_IP: undefined });
    expect(config.MAX_ROOMS_PER_IP).toBe(3);
  });

  test('is still a small fraction of the new, larger MAX_ROOMS pool', () => {
    const config = loadConfigWith({ MAX_ROOMS: undefined, MAX_ROOMS_PER_IP: undefined });
    expect(config.MAX_ROOMS_PER_IP / config.MAX_ROOMS).toBeLessThan(0.1);
  });
});
