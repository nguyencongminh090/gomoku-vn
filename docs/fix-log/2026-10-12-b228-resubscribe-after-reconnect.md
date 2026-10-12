# #228 — Lobby/tournament lists freeze after socket reconnect
**Date:** 2026-10-12   **Branch:** feature/226-socket-audit

## Root cause
`lobby:subscribe`, `tournament:subscribe`, `live_matches:subscribe` were emitted once at module load. A reconnect is a new server socket in no rooms, so pushes stopped until reload (audit #226 F3).

## Fix
`lobby.js` and `tournaments.js`: `disconnect` sets a flag; the next `connect` re-emits the subscribes (snapshots return with them). Gated on the flag so the first connect doesn't double the load-time emit. Same pattern as `lobby-home.js` `home`. No server change. `?v=` bumped (310).

## Tests
`client/tests/resubscribe-on-reconnect.test.js`: first connect → no extra emit; disconnect→connect → one more per subscribe.

## Real-browser pass (headless Chromium, isolated server copy, guest login)
Lobby `#rooms` open → server SIGTERM + restart (#227 reconnect) → second client creates a room.
Before fix: list still shows the stale pre-restart row, new room never appears. After fix: list replaced by the post-restart snapshot containing the new room. 0 console errors.
Not covered in browser: tournaments.js (jsdom only).
