'use strict';

/**
 * listen-backlog.test.js — regression guard for the TCP accept-queue depth.
 *
 * Why this exists: Node's default listen backlog is 511. Under a burst of
 * thousands of simultaneous NEW connections the kernel overflows that queue and
 * drops SYNs. The failure is invisible server-side (no log line, no error
 * event) and surfaces only as "connect timeout" on the client, which is why it
 * went unnoticed until measured — see docs/stress-test-report.md §10 and
 * TODO.md Phần B. At 4000 concurrent connecting players, backlog=511 lost
 * ~12-14% of connections while backlog=4096 completed 100% clean.
 *
 * These tests pin the two things that actually protect that fix: the default
 * must not silently fall back to Node's 511, and server.listen() must actually
 * be handed the value (a config constant nothing reads would be worthless).
 */

const fs = require('fs');
const path = require('path');

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

describe('LISTEN_BACKLOG config', () => {
  test('defaults well above Node\'s 511, which is the value that overflowed', () => {
    const config = loadConfigWith({ LISTEN_BACKLOG: undefined });
    expect(config.LISTEN_BACKLOG).toBe(4096);
    expect(config.LISTEN_BACKLOG).toBeGreaterThan(511);
  });

  test('honours an explicit LISTEN_BACKLOG override', () => {
    const config = loadConfigWith({ LISTEN_BACKLOG: '1024' });
    expect(config.LISTEN_BACKLOG).toBe(1024);
  });

  test('falls back to the safe default when the env value is not a number', () => {
    const config = loadConfigWith({ LISTEN_BACKLOG: 'not-a-number' });
    expect(config.LISTEN_BACKLOG).toBe(4096);
  });
});

describe('server.listen wiring', () => {
  // Asserted against the source rather than by booting the server: index.js
  // binds a real port and opens the SQLite database on require, which a unit
  // test should not do. The point here is narrow — that the constant above is
  // actually passed to listen() and not just exported and forgotten.
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

  test('passes config.LISTEN_BACKLOG to server.listen()', () => {
    expect(source).toMatch(/server\.listen\(\{[^}]*backlog:\s*config\.LISTEN_BACKLOG/);
  });

  test('does not call the bare listen(port, cb) form that would use Node\'s 511 default', () => {
    expect(source).not.toMatch(/server\.listen\(\s*config\.HTTP_PORT\s*,/);
  });
});

describe('trust proxy', () => {
  // Same rationale as above — asserted against source, not by booting the
  // server. A proxy/tunnel (e.g. cloudflared) in front of this process sets
  // X-Forwarded-For; without `trust proxy` configured, express-rate-limit
  // throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every rate-limited request
  // instead of running at all. 'loopback' (not `true`) is required, not just
  // any truthy value — trusting every peer would let a client that reaches
  // this port directly (bypassing the tunnel) spoof its own
  // X-Forwarded-For to dodge the auth rate limit and the per-IP room quota.
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

  test('trusts only the loopback hop for X-Forwarded-For', () => {
    expect(source).toMatch(/app\.set\(\s*['"]trust proxy['"]\s*,\s*['"]loopback['"]\s*\)/);
  });
});
