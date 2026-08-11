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

module.exports = { staticOptions, setStaticCacheHeaders, IMMUTABLE, REVALIDATE };
