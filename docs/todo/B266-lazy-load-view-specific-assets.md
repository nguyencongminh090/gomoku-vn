# B266 — Load view-specific lobby/room assets only when the view needs them
**Status:** OPEN
**Area:** `client/index.html`, `client/js/index-entry.js`, `tournaments.js`, `private-chat.js`, `client/room.html`, `css/lobby.css`
**From:** user question after #264, 2026-10-17   **Depends:** #265 (do after; lower priority)

## Problem
Lobby loads every tab's code up front. Candidates (brotli): `tournaments.js` 6.0 KB (tournaments tab only),
`private-chat.js` 6.6 KB (online-users modal / DM only). Room loads `css/lobby.css` 5.6 KB — unknown if room uses it.
Total ≈ 12–18 KB of ~128–145 KB per page, first visit only (assets are immutable-cached).

## Scope
1. Confirm what each candidate does at startup (badges, listeners, home widgets, socket handlers) before moving it.
2. Lazy-load the ones with no startup duty on first open of their view; prefetch on idle if the first-open RTT shows.
3. Check room's use of `lobby.css` selectors (Coverage tab, real browser); drop or split if unused.
4. Measure before/after: bytes + requests at load, first-open latency of tournaments tab / DM.

## Don't
- Don't add a bundler; don't split `i18n.js` (user declined 2026-10-17).
- Don't delay anything on the lobby critical path tuned in #263 (`api-early.js`, socket-early).

## Traps
- Lazy module URL must match the shared `?v=` exactly (one module = one URL), and the `modulepreload` list must drop it.
- `private-chat.js` may receive DM socket events / unread badges while closed → then it is not lazy-able.
- Each lazy load costs 1 RTT (~150–300 ms VN) on first open — the cost #262/#263 removed elsewhere.

## Why this way
Small byte win; only worth it where a view is genuinely unused at startup. Rejected: bundling (already parallel).
Knowledge: none.

## Done when
- Measured saving recorded in fix-log; first open of each lazy view works in a real browser; `npm test` green.
