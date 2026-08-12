'use strict';

/**
 * staticCache.js — Cache-Control policy for the static client assets
 * (TODO.md #106).
 *
 * Pulled out of index.js for the same reason as ./csp.js: the policy itself
 * is then unit-testable (server/tests/static-cache-control.test.js) without
 * booting the real server.
 *
 * `express.static()` with no options defaults to `maxAge: 0`, which emits
 * `Cache-Control: public, max-age=0` — "you may cache this, but ask me again
 * before every single use". Both the browser and Cloudflare then revalidate
 * against the origin for every asset on every page load (measured:
 * `cf-cache-status: REVALIDATED`, never `HIT`), even though nothing changed.
 * That directly contradicts the `?v=N` cache-busting scheme the repo already
 * pays for (see CLAUDE.md): the whole point of `?v=N` is that a changed file
 * gets a *new URL*, which is exactly what makes caching the old URL forever
 * safe.
 *
 * HTML is the deliberate exception: the HTML files are where the `?v=N`
 * numbers live, so caching them long would mean a version bump never reaches
 * users — recreating the very bug class `?v=N` exists to prevent (TODO.md
 * #51). `no-cache` (revalidate every time, reuse on matching ETag) rather
 * than `no-store`: the HTML is small and already has an ETag, so a
 * revalidation round-trip is enough.
 */

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

/**
 * Cache policy for the socket.io browser client (TODO.md #111).
 *
 * Deliberately NOT `IMMUTABLE`, and deliberately a separate export rather
 * than a path exception inside setStaticCacheHeaders() below: that function's
 * contract is "assets under client/, all of which carry a `?v=N`", and the
 * socket.io client satisfies neither half.
 *
 * `immutable` is only safe because `?v=N` gives changed content a new URL.
 * This file is served from node_modules at a fixed URL with no `?v=N` (see
 * CLAUDE.md's #107 guidance — the version scheme deliberately does not cover
 * it), so its content changes on `npm update socket.io` while its URL does
 * not. Pinning it for a year would leave browsers running an old client
 * against a new server — which fails as "connects fine, but a few events
 * silently never fire", the worst kind of bug to chase.
 *
 * One day is the compromise: it removes the per-page-load revalidation
 * round-trip that motivated #111, and any version skew self-heals within 24h
 * without anyone having to remember a cache-busting step.
 */
const SOCKET_IO_CLIENT = 'public, max-age=86400';

/**
 * setHeaders hook for express.static.
 * @param {import('http').ServerResponse} res
 * @param {string} filePath absolute path of the file being served
 */
function setStaticCacheHeaders(res, filePath) {
  if (filePath.endsWith('.html')) {
    res.setHeader('Cache-Control', REVALIDATE);
  } else {
    res.setHeader('Cache-Control', IMMUTABLE);
  }
}

const staticOptions = { setHeaders: setStaticCacheHeaders };

/** express.static options for the socket.io client mount (TODO.md #111). */
const socketIoClientOptions = {
  setHeaders(res) {
    res.setHeader('Cache-Control', SOCKET_IO_CLIENT);
  },
  index: false,
};

module.exports = {
  staticOptions,
  setStaticCacheHeaders,
  socketIoClientOptions,
  IMMUTABLE,
  REVALIDATE,
  SOCKET_IO_CLIENT,
};
