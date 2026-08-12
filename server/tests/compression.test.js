'use strict';

/**
 * compression.test.js — Unit tests for TODO.md #105.
 *
 * The server shipped every static text asset uncompressed: no
 * `app.use(compression())` anywhere, and `compression` was not even a
 * dependency. Measured on the lobby page, 327 486 B of css/js/html left the
 * origin at full size where gzip would have sent 79 018 B (-76%).
 *
 * Cloudflare compresses at the edge, so this was never visible to end users —
 * which is exactly why it needs a test rather than trusting anyone to notice.
 * The regression modes are all silent:
 *
 *   - the middleware gets dropped, or
 *   - it gets mounted *after* express.static, where it can no longer wrap the
 *     response that has already been written, or
 *   - someone adds an explicit filter/threshold that quietly excludes the
 *     asset types that actually matter.
 *
 * Mirrors the structure of static-cache-control.test.js (TODO.md #106): a real
 * express mount over a real HTTP server, driven with raw `http` rather than
 * `supertest`, so no new dependency is added just to read a response header.
 * Raw `http` is also required rather than `fetch` here: undici transparently
 * decodes `Content-Encoding` and strips the header, which would make every
 * assertion below unfalsifiable.
 */

const compression = require('compression');
const express = require('express');
const http = require('http');
const path = require('path');
const zlib = require('zlib');

const { staticOptions } = require('../config/staticCache');

const clientPath = path.join(__dirname, '..', '..', 'client');

let server;
let port;

beforeAll(async () => {
  const app = express();
  // Same order as server/index.js: compression first, then the static handler.
  app.use(compression());
  app.use(express.static(clientPath, staticOptions));
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  port = server.address().port;
});

afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

/**
 * Raw GET that does NOT decode the body, so Content-Encoding survives.
 * @returns {Promise<{status:number, headers:object, body:Buffer}>}
 */
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

const GZIP = { 'Accept-Encoding': 'gzip' };

// --------------------------------------------------------------------------
// Basic/correctness: the compressible asset types actually shipped
// --------------------------------------------------------------------------
describe('text assets are compressed when the client accepts gzip', () => {
  // One representative per equivalence class of compressible content-type
  // that the lobby page actually requests.
  test.each([
    ['/js/i18n.js', 'ES module — largest text asset on the page'],
    ['/css/main.css', 'stylesheet'],
    ['/index.html', 'HTML document'],
  ])('%s (%s) is gzipped', async (urlPath) => {
    const res = await rawGet(urlPath, GZIP);

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    // A `Content-Length` matching the *uncompressed* size is the signature of
    // the old behaviour; compression must remove it in favour of chunked.
    expect(res.headers['content-length']).toBeUndefined();
  });

  test('gzipped body decodes back to the exact original bytes', async () => {
    const [compressed, identity] = await Promise.all([
      rawGet('/js/i18n.js', GZIP),
      rawGet('/js/i18n.js', { 'Accept-Encoding': 'identity' }),
    ]);

    // Not just "it didn't throw": the decoded payload must be byte-identical,
    // otherwise we would happily ship corrupted JS.
    expect(zlib.gunzipSync(compressed.body)).toEqual(identity.body);
  });

  test('compression is a real saving, not a formality', async () => {
    const compressed = await rawGet('/js/i18n.js', GZIP);
    const identity = await rawGet('/js/i18n.js', { 'Accept-Encoding': 'identity' });

    // Measured ~76% for this file; assert a deliberately loose floor so the
    // test pins the behaviour without breaking on zlib/content changes.
    expect(compressed.body.length).toBeLessThan(identity.body.length * 0.5);
  });
});

// --------------------------------------------------------------------------
// Rare/edge cases
// --------------------------------------------------------------------------
describe('compression edge cases', () => {
  test('a client that does not accept gzip still gets valid, unencoded bytes', async () => {
    const res = await rawGet('/css/main.css', { 'Accept-Encoding': 'identity' });

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('already-compressed fonts are NOT re-compressed', async () => {
    // woff2 is compressed by definition; gzipping it again burns CPU for
    // nothing and can grow the payload. This pins the default `compressible`
    // content-type filter, which the instruction file says to verify rather
    // than replace with a hand-rolled one.
    const res = await rawGet('/vendor/fonts/manrope/manrope-latin.woff2', GZIP);

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  test('tiny responses below the size threshold are left alone', async () => {
    // compression's default threshold is 1 KB; theme-preload.js is ~163 B.
    // Compressing payloads this small typically makes them bigger.
    const res = await rawGet('/js/theme-preload.js', GZIP);

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  test('Vary: Accept-Encoding is set so caches do not serve the wrong variant', async () => {
    // Without this, Cloudflare (or any shared cache) could hand a gzipped body
    // to a client that asked for identity — a real corruption path, not a nicety.
    const res = await rawGet('/js/i18n.js', GZIP);

    expect(String(res.headers.vary)).toMatch(/Accept-Encoding/i);
  });
});

// --------------------------------------------------------------------------
// Wiring: the tests above mount the middleware themselves, so on their own
// they would all still pass if server/index.js stopped using it entirely.
// index.js cannot be require()d here (it opens the real DB and listens), so
// assert the wiring against its source instead.
// --------------------------------------------------------------------------
describe('server/index.js actually mounts compression, before the static handler', () => {
  // Comment lines are stripped first, on purpose: index.js documents this
  // middleware in prose right above the call, so a naive search matches the
  // comment and would keep passing even after the real `app.use` line was
  // deleted or commented out — i.e. exactly the regression being guarded.
  const source = require('fs')
    .readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

  test('compression is required and mounted', () => {
    expect(source).toMatch(/require\(['"]compression['"]\)/);
    expect(source).toMatch(/app\.use\(compression\(\)\)/);
  });

  test('it is mounted before express.static, or it would never run', () => {
    const compressionAt = source.indexOf('app.use(compression()');
    const staticAt = source.indexOf('app.use(express.static(');

    expect(compressionAt).toBeGreaterThan(-1);
    expect(staticAt).toBeGreaterThan(-1);
    expect(compressionAt).toBeLessThan(staticAt);
  });

  test('compression is a real dependency, not a stray devDependency', () => {
    const pkg = require('../../package.json');
    expect(pkg.dependencies).toHaveProperty('compression');
  });
});

// --------------------------------------------------------------------------
// Interaction with TODO.md #106 — the two policies share this middleware chain
// --------------------------------------------------------------------------
describe('compression does not disturb the #106 cache policy', () => {
  test('a compressed asset is still immutable', async () => {
    const res = await rawGet('/js/i18n.js', GZIP);

    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  test('compressed HTML still revalidates', async () => {
    const res = await rawGet('/index.html', GZIP);

    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers['cache-control']).toBe('no-cache');
  });
});
