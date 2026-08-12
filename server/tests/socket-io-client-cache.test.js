'use strict';

/**
 * socket-io-client-cache.test.js — Unit tests for TODO.md #111.
 *
 * TODO.md #106 made every static asset immutable, but it fixed
 * `express.static` — and the socket.io browser client never goes through
 * express.static. socket.io serves it from its own handler with a hardcoded
 * `Cache-Control: public, max-age=0`, so it stayed the one asset costing an
 * origin round-trip on every page load, on all four pages.
 *
 * The fix serves that file ourselves from `/vendor/socket.io/`. It cannot be
 * served under `/socket.io/`: engine.io claims that whole prefix at the
 * HTTP-server level, before Express is reached. That constraint is the reason
 * the HTML files had to change, so it is pinned as a test below rather than
 * left as a comment someone could "clean up".
 *
 * Raw `http` instead of fetch/supertest, matching static-cache-control.test.js
 * and compression.test.js.
 */

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const {
  socketIoClientOptions,
  staticOptions,
  SOCKET_IO_CLIENT,
  IMMUTABLE,
} = require('../config/staticCache');

const clientPath = path.join(__dirname, '..', '..', 'client');
const socketIoClientPath = path.join(
  path.dirname(require.resolve('socket.io/package.json')),
  'client-dist'
);

let server;
let io;
let port;

beforeAll(async () => {
  const app = express();
  // Same wiring/order as server/index.js.
  app.use('/vendor/socket.io', express.static(socketIoClientPath, socketIoClientOptions));
  app.use(express.static(clientPath, staticOptions));
  server = http.createServer(app);
  io = new Server(server);
  await new Promise(resolve => server.listen(0, resolve));
  port = server.address().port;
});

afterAll(async () => {
  if (io) io.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

function rawGet(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
  });
}

// --------------------------------------------------------------------------
// The policy value itself
// --------------------------------------------------------------------------
describe('socket.io client cache policy', () => {
  test('is cacheable for a day', () => {
    expect(SOCKET_IO_CLIENT).toBe('public, max-age=86400');
  });

  test('is NOT immutable — the URL carries no ?v=N, so content can change under it', () => {
    // The whole point of the separate policy. If someone "unifies" this with
    // the client/ policy, an `npm update socket.io` would strand browsers on
    // a year-old client that connects but silently misses events.
    expect(SOCKET_IO_CLIENT).not.toMatch(/immutable/);
    expect(SOCKET_IO_CLIENT).not.toBe(IMMUTABLE);
  });
});

// --------------------------------------------------------------------------
// Serving the file
// --------------------------------------------------------------------------
describe('/vendor/socket.io/socket.io.min.js', () => {
  test('is served, and is the real minified client', async () => {
    const res = await rawGet('/vendor/socket.io/socket.io.min.js');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    // Not just "200 with some bytes": it must actually define the global the
    // four pages depend on.
    expect(res.body.toString('utf8')).toMatch(/\bio\b/);
    expect(res.body.length).toBeGreaterThan(10000);
  });

  test('no longer revalidates on every load', async () => {
    const res = await rawGet('/vendor/socket.io/socket.io.min.js');

    expect(res.headers['cache-control']).toBe(SOCKET_IO_CLIENT);
    expect(res.headers['cache-control']).not.toMatch(/max-age=0/);
  });

  test('byte-identical to the file socket.io itself would have served', async () => {
    const res = await rawGet('/vendor/socket.io/socket.io.min.js');
    const onDisk = fs.readFileSync(path.join(socketIoClientPath, 'socket.io.min.js'));

    expect(res.body).toEqual(onDisk);
  });
});

// --------------------------------------------------------------------------
// The constraint that forced the URL change
// --------------------------------------------------------------------------
describe('engine.io owns the /socket.io/ prefix', () => {
  test('socket.io still serves the old URL, so stale HTML keeps working', async () => {
    // serveClient is deliberately left enabled: a stale dist/ build (TODO.md
    // #109) or a cached page still referencing the old path must degrade to
    // the previous behaviour, not break with no global `io`.
    const res = await rawGet('/socket.io/socket.io.min.js');

    expect(res.status).toBe(200);
    // ...and it still carries socket.io's own uncacheable header, which is
    // precisely why the pages were pointed elsewhere.
    expect(res.headers['cache-control']).toBe('public, max-age=0');
  });

  test('the engine.io handshake is unaffected', async () => {
    const res = await rawGet('/socket.io/?EIO=4&transport=polling');

    expect(res.status).toBe(200);
    expect(res.body.toString('utf8')).toMatch(/"sid"/);
  });
});

// --------------------------------------------------------------------------
// Wiring: the pages and the server must agree, or the site loads no socket
// --------------------------------------------------------------------------
describe('wiring', () => {
  const pages = ['index.html', 'room.html', 'tournament.html', 'tournament-match.html'];

  test.each(pages)('%s loads the client from the cacheable path', (page) => {
    const html = fs.readFileSync(path.join(clientPath, page), 'utf8');

    expect(html).toContain('src="/vendor/socket.io/socket.io.min.js"');
    // The old path must be gone from the shipped pages, otherwise the
    // round-trip this item removes silently comes back.
    expect(html).not.toContain('src="/socket.io/socket.io.min.js"');
  });

  test('server/index.js mounts the vendor path', () => {
    const source = fs
      .readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
      .split('\n')
      .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');

    expect(source).toContain("app.use('/vendor/socket.io'");
    expect(source).toMatch(/socketIoClientOptions/);
  });

  test('the mount is not shadowed by the client/ static handler', () => {
    // client/vendor/ exists (phosphor, fonts). If someone ever adds a real
    // client/vendor/socket.io/ directory, or reorders the two mounts, the
    // node_modules copy would stop being what is served.
    expect(fs.existsSync(path.join(clientPath, 'vendor', 'socket.io'))).toBe(false);

    const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    const vendorAt = source.indexOf("app.use('/vendor/socket.io'");
    const clientAt = source.indexOf('app.use(express.static(clientPath');
    expect(vendorAt).toBeGreaterThan(-1);
    expect(clientAt).toBeGreaterThan(-1);
    expect(vendorAt).toBeLessThan(clientAt);
  });
});
