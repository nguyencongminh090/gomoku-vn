'use strict';

/**
 * static-cache-control.test.js — Unit tests for TODO.md #106.
 *
 * `express.static()` was called with no options, so every static asset went
 * out as `Cache-Control: public, max-age=0` and both the browser and
 * Cloudflare revalidated against the origin for every asset on every page
 * load. These tests pin the two halves of the replacement policy:
 *
 *   - versioned assets (`?v=N` per CLAUDE.md) → cacheable forever/immutable
 *   - `*.html` → always revalidated, because HTML is where the `?v=N`
 *     numbers themselves live; caching it long would stop a version bump
 *     from ever reaching users (the bug class of TODO.md #51)
 *
 * A regression here is cheap to introduce (a new `app.use` mounted before
 * the static handler, or someone "simplifying" the options object away) and
 * invisible in normal use, which is exactly what makes it worth asserting.
 *
 * Two layers are covered on purpose: the pure `setStaticCacheHeaders`
 * function, and a real `express.static` mount serving the real `client/`
 * directory over a real HTTP server — the function being right does not
 * prove it is actually wired into the middleware.
 */

const express = require('express');
const http = require('http');
const path = require('path');

const {
  staticOptions,
  setStaticCacheHeaders,
  IMMUTABLE,
  REVALIDATE,
} = require('../config/staticCache');

const clientPath = path.join(__dirname, '..', '..', 'client');

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.static(clientPath, staticOptions));
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

// --------------------------------------------------------------------------
// Unit: the policy function itself
// --------------------------------------------------------------------------
describe('setStaticCacheHeaders', () => {
  function headerFor(filePath) {
    const set = {};
    setStaticCacheHeaders({ setHeader: (k, v) => { set[k] = v; } }, filePath);
    return set['Cache-Control'];
  }

  // Equivalence class: every non-HTML asset type actually shipped in client/,
  // all of which are referenced through a `?v=N` URL and so are safe to pin.
  test.each([
    ['/srv/client/js/i18n.js', 'ES module'],
    ['/srv/client/css/main.css', 'stylesheet'],
    ['/srv/client/vendor/phosphor/regular/Phosphor.woff2', 'font'],
    ['/srv/client/img/logo.png', 'image'],
    ['/srv/client/favicon.ico', 'no-dot-path-segment extension'],
  ])('%s (%s) is immutable', (filePath) => {
    expect(headerFor(filePath)).toBe(IMMUTABLE);
  });

  test('.html always revalidates', () => {
    expect(headerFor('/srv/client/index.html')).toBe(REVALIDATE);
  });

  // Boundary: only a real .html *suffix* counts. A file whose name merely
  // contains ".html" mid-string is an ordinary asset and must stay immutable,
  // or a rename could silently drop an asset out of the cache.
  test.each([
    ['/srv/client/js/html-utils.js', IMMUTABLE],
    ['/srv/client/js/index.html.js', IMMUTABLE],
    ['/srv/client/index.htm', IMMUTABLE],
    ['/srv/client/index.HTML', IMMUTABLE], // case-sensitive by design: the repo has no uppercase filenames
    ['/srv/client/room.html', REVALIDATE],
  ])('%s → %s', (filePath, expected) => {
    expect(headerFor(filePath)).toBe(expected);
  });

  test('the immutable value carries a year max-age and the immutable token', () => {
    expect(IMMUTABLE).toBe('public, max-age=31536000, immutable');
    expect(REVALIDATE).toBe('no-cache');
  });
});

// --------------------------------------------------------------------------
// Integration: the policy as actually served by express.static
// --------------------------------------------------------------------------
describe('express.static wiring (real client/ files)', () => {
  test('a versioned JS asset is served immutable', async () => {
    const res = await fetch(`${baseUrl}/js/i18n.js?v=103`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(IMMUTABLE);
  });

  test('a CSS asset is served immutable', async () => {
    const res = await fetch(`${baseUrl}/vendor/phosphor/regular/style.css?v=103`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(IMMUTABLE);
  });

  test('index.html is served no-cache, not max-age=0 and not immutable', async () => {
    const res = await fetch(`${baseUrl}/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(REVALIDATE);
  });

  test('the directory-index form (/) also gets the HTML policy', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(REVALIDATE);
  });

  // `no-cache` is only cheap if revalidation can actually answer 304 — that
  // is the whole reason HTML gets `no-cache` rather than `no-store`.
  // Raw http.get, not fetch(): undici keeps its own HTTP cache and replays a
  // 304 to the caller as a 200 with the cached body, which would hide a real
  // regression here.
  test('HTML keeps an ETag so no-cache revalidation returns 304', async () => {
    const get = (headers) => new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}/index.html`, { headers }, (res) => {
        res.resume();
        res.on('end', () => resolve(res));
      });
      req.on('error', reject);
    });

    const first = await get({});
    expect(first.statusCode).toBe(200);
    expect(first.headers.etag).toBeTruthy();

    const revalidated = await get({ 'if-none-match': first.headers.etag });
    expect(revalidated.statusCode).toBe(304);
    expect(revalidated.headers['cache-control']).toBe(REVALIDATE);
  });
});
