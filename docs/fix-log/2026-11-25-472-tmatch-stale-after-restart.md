# 2026-11-25 19:40 — #472 Match page kept the aborted game live after a server restart
## Prompt
"Do #472" — after a restart mid-game both tournament-match pages still showed 3 moves, a ticking clock and a clickable board.
## Root cause
`tournament-match.js` emitted `tmatch:subscribe` once at module load and never again. After the
restart the server hydrates the pairing to Ready (no entry in `tournamentGameMap`), so
`resyncOnConnect` pushes nothing and nobody asks for the state; the page keeps its local game.
Second layer found in the real-browser pass: a graceful restart disconnects with
`io server disconnect`, and #227 reconnects by hand (`sock.connect()`), which never fires the
Manager's `reconnect` event — so a hook on that event alone missed exactly this case.
## Fix
- `SocketClient.onReconnect(cb)`: fires on every `connect` that follows a `disconnect` (both paths).
- `tournament-match.js`: re-emit `tmatch:subscribe` on reconnect; the server's existing
  `NO_ACTIVE_MATCH` answer → alert + back to the tournament page (existing handler).
- i18n `err.no_active_match` (vi/en) — key was missing, alert showed the raw key.
- Server untouched (replay-on-restart rule kept, per todo "Don't").
## Verification
- `client/tests/tournament-match-reconnect.test.js` (failed before fix), `socket-client-on-reconnect.test.js`.
- `npm test` green; `cache-bust.js` OK.
- Real browser: `features/club-platform/verify.cjs e2e2` now asserts both match pages leave
  `tournament-match` within 15 s of the restart, one dialog each.
