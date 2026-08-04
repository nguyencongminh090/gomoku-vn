# Fix log entry — 2026-08-01 22:30

## Prompt

Backend fix #6 (security review 2026-08-01): kicking a mid-game player during their disconnect grace window created a "ghost game" — `kickUser` in [RoomManager.js:391](server/managers/RoomManager.js#L391) only blocked kicks while `room.state === 'playing'`, but a disconnected player's room state is `'interrupted'` (set in `startDisconnectGrace`), so the host could kick them mid-grace. The victim was removed from `room.users`/`userRoomMap` but stayed in `disconnectTimers` and `gameState.players`; on reconnect they'd rejoin the socket.io room and get `game:init`, but every move was rejected, while the host was credited a timeout win against a player who no longer had a room to play in.

## Action

Two changes: (1) [RoomManager.js:391](server/managers/RoomManager.js#L391) — `kickUser` now also refuses when `room.state === 'interrupted'`, closing the entire window during which any player's grace timer can be active (state stays `'interrupted'` for as long as any `disconnectTimers` entry exists for the room, per fix #4's logic, and only flips to `'playing'` once nobody is left in grace). (2) [DisconnectHandler.js](server/socket/handlers/DisconnectHandler.js), `cancelDisconnectGrace` — added `if (!room.users.has(user.userId)) return false;` right after resolving the room, as defense in depth in case membership is ever lost by some other path.

## Decision

Blocking kick during `'interrupted'` alone already closes the exploited window (state is `'interrupted'` for the entire duration any player is in grace, confirmed by tracing fix #4's state transitions), so the membership check in `cancelDisconnectGrace` is redundant-by-design rather than load-bearing — kept anyway because it's a 2-line guard against a class of "member removed by a path I didn't check" bugs, and the review explicitly asked for both.

## Summary output

`npm test`: 144/145 passing, same baseline. Had to update the `activeGameRoom()` test fixture in `DisconnectHandler.test.js` (shared by 4 existing tests) to add a `.users` Map and `state: 'interrupted'` — the fixture never carried `.users` before because nothing read it; this is a mock completeness fix, not a weakened assertion (matches how real `RoomManager` rooms are always constructed with a `.users` Map). Flagged to the user before applying per the "don't edit tests to dodge failures" restriction; user confirmed completing the fixture was correct. Wrote and ran (then discarded) a temporary Jest test against the real (non-mocked) `RoomManager` singleton: created a room, joined a second user, set `room.state = 'interrupted'`, called `kickUser` — asserted an error was returned and the victim remained in `room.users`. Passed.
