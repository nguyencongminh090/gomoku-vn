# 2026-11-22 — #433 remaining jest open handles (2 housekeeping intervals + 1 test-leaked grace timer)
## Prompt
"Do #433" — `npm test` still printed "A worker process has failed to exit gracefully" after the RoomManager unref.
## Root cause
`npx jest --detectOpenHandles` (4600 tests) listed 3 `Timeout` handles:
1. `server/socket/tournamentState.js:78` — module-level deadline-sweep `setInterval`, no `unref()`; every test requiring SocketHandler/TournamentManager leaked it.
2. `server/socket/SocketHandler.js:442` — `init()` starts the 60 s orphan-timer sweep, no `unref()`.
3. `server/tests/DisconnectHandler.test.js:135` — the race-guard block runs on real timers, so `startSpectatorGrace` left a real 30 s+ `setTimeout`; `beforeEach` only `.clear()`ed the map.
The earlier `client/tests/socket-client-server-disconnect.test.js:62` trace did not reappear (fake timers; no real handle).
## Fix
1+2: `unref()` right after creation (typeof-guarded); timer behaviour unchanged, the HTTP server keeps prod alive.
3: test-only — top-level `afterEach` clears `timeout`/`countdown` of every pending grace entry, then the maps. No prod change.
## Verification
New `server/tests/tournamentState-interval-unref.test.js` + `SocketHandler.test.js` "init() unref()s its periodic orphan-timer sweep": both failed before (hasRef true; jest hung), pass after.
Full `npx jest --detectOpenHandles`: 0 handles, 4602 pass; `npm test`: 265 suites green, no "failed to exit gracefully".
