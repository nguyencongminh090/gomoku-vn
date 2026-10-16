'use strict';

/**
 * api-early.js — start the lobby's first REST calls while the page is still
 * parsing (TODO.md #263). index.html only.
 *
 * Measured (HAR 2026-10-16 23-21-10, cache disabled): the five lobby APIs
 * started at 559 ms, ~340 ms after the first JS request (220 ms), because each
 * one is issued from an ES module (deferred until the whole graph has loaded and
 * the document has parsed). None of them needs anything a module provides — only
 * the cookie and the `gvn_user` cache — so they start here, in a classic
 * `<head>` script, and the modules pick the in-flight response up instead of
 * issuing their own request.
 *
 * Rules that keep this from changing behaviour:
 *  - Same URL, same `credentials: 'same-origin'` as the module call, and the
 *    promise is handed out once (`take`). The second caller — every 60 s poll —
 *    gets a fresh fetch, never a body that has already been read.
 *  - Nothing starts unless `requireAuth()` would let the page stay: no cached
 *    user means login.html is coming, so no request. A legacy-token-only browser
 *    (pre-#68 migration still in flight) also gets nothing; its modules fetch as
 *    before, after migration had its chance.
 *  - Each URL starts only under the condition its consumer checks:
 *      /api/home          lobby-home.js loadHome() — home screen (no #rooms /
 *                         #tournaments / ?tab=tournaments)
 *      /api/clubs/mine    tournaments.js — any cached user (guests included)
 *      /api/notifications platform-shell.js refreshBell() — members, tab visible
 *      /api/rankings/me   platform-shell.js mountAccount() — members
 *      /api/admin/me      platform-shell.js mountAccount() — members
 *
 * Must sit after session.js and above every stylesheet link (same reason as
 * socket-early.js: a classic script after a stylesheet waits for it).
 */

(function (global) {
  const pending = new Map();
  const INIT = { credentials: 'same-origin' };

  function start(url) {
    try {
      const p = global.fetch(url, INIT);
      p.catch(() => { /* the consumer's own .catch handles it once taken */ });
      pending.set(url, p);
    } catch { /* fetch unavailable — consumers fall back to their own call */ }
  }

  /** The in-flight early response for `url` (once), or null. */
  function take(url) {
    const p = pending.get(url);
    if (!p) return null;
    pending.delete(url);
    return p;
  }

  /** Drop-in for `fetch(url, init)` at a consumer: early response if one is waiting, else a real fetch. */
  function fetchEarly(url, init) {
    return take(url) || global.fetch(url, init);
  }

  function homeScreen(loc) {
    if (new URLSearchParams(loc.search).get('tab') === 'tournaments') return false;
    return loc.hash !== '#tournaments' && loc.hash !== '#rooms';
  }

  function run() {
    const session = global.GvnSession;
    const user = session && session.getUser && session.getUser();
    if (!user) return;
    if (homeScreen(global.location)) start('/api/home');
    start('/api/clubs/mine');
    if (user.isGuest) return;
    if (!global.document.hidden) start('/api/notifications');
    start('/api/rankings/me');
    start('/api/admin/me');
  }

  global.GvnEarly = { take, fetch: fetchEarly };
  run();
})(window);
