'use strict';

/**
 * listen-host.test.js — #417: production binds the HTTP listener to loopback.
 *
 * In production the only legitimate client of HTTP_PORT is cloudflared on the
 * same machine. Listening on every interface leaves ufw as the single thing
 * between the internet and Node; LISTEN_HOST=127.0.0.1 makes a firewall mistake
 * harmless. Default stays "all interfaces" so local dev / LAN testing is unchanged.
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

describe('LISTEN_HOST config', () => {
  test('unset → undefined (Node listens on all interfaces, dev unchanged)', () => {
    expect(loadConfigWith({ LISTEN_HOST: undefined }).LISTEN_HOST).toBeUndefined();
  });

  test('blank → undefined, not an empty-string host', () => {
    expect(loadConfigWith({ LISTEN_HOST: '  ' }).LISTEN_HOST).toBeUndefined();
  });

  test('honours LISTEN_HOST=127.0.0.1', () => {
    expect(loadConfigWith({ LISTEN_HOST: '127.0.0.1' }).LISTEN_HOST).toBe('127.0.0.1');
  });
});

describe('server.listen wiring', () => {
  // Source check, as in listen-backlog.test.js: requiring index.js binds a port and opens the DB.
  test('index.js passes config.LISTEN_HOST to server.listen', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    const call = src.match(/server\.listen\(\{[^}]*\}/);
    expect(call).not.toBeNull();
    expect(call[0]).toMatch(/host:\s*config\.LISTEN_HOST/);
    expect(call[0]).toMatch(/backlog:\s*config\.LISTEN_BACKLOG/);
  });
});
