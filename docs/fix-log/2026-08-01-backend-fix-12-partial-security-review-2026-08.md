# Fix log entry — 2026-08-01 22:30

## Prompt

Backend fix #12-partial (security review 2026-08-01): `broadcastLobbyUpdate` in [state.js:54-56](server/socket/state.js#L54-L56) sent the full 10-room list to every lobby viewer on every single room mutation, called from ~15 sites across `DisconnectHandler.js`, `GameHandler.js`, `LobbyHandler.js`, `RoomHandler.js`, `state.js` itself. Measured: one seat+ready+start+resign cycle in a single room pushed 4 separate `lobby:update` packets (10 759B) to an idle lobby user who did nothing. This entry covers only the debounce half of fix #12 — switching `lobby:update` to a per-room delta changes the client's data contract and was left for a separate, client-touching pass per this task's restrictions.

## Action

Rewrote `broadcastLobbyUpdate(io)` in [state.js](server/socket/state.js) to coalesce calls: a `WeakMap<io, timeout>` tracks a pending broadcast per `io` instance; if one is already scheduled, subsequent calls in the same ~300ms window are no-ops; the actual `io.to('lobby').emit('lobby:update', ...)` fires once, 300ms after the first call in a burst, then the `WeakMap` entry clears so the next burst schedules its own broadcast. Constant `LOBBY_UPDATE_DEBOUNCE_MS = 300` (mid-point of the review's suggested 200-500ms range).

## Decision

Chose "coalesce-into-one-trailing-emit" over a resetting/postponing debounce (where each new call pushes the deadline further out) specifically because `broadcastLobbyUpdate` is called from a genuinely continuous stream of unrelated room activity across a busy lobby — a resetting debounce could starve viewers indefinitely under sustained churn across many rooms, while the chosen coalesce-then-reset approach guarantees an update at most every ~300ms regardless of how busy the lobby gets. Keyed the pending-timer map by the `io` instance (not a bare module-level variable) so multiple `io` instances (e.g. under test) don't cross-contaminate. Did not touch `SocketHandler.js:44`'s separate direct `lobby:update` emit (the `room_destroyed` idle-cleanup listener) — it wasn't one of the 15 sites the review named as calling `broadcastLobbyUpdate`, and touching it would be outside this fix's specified scope.

## Summary output

`npm test`: 145/145 passing — both existing consumers (`LobbyHandler.test.js`, `DisconnectHandler.test.js`) mock `broadcastLobbyUpdate` entirely via `jest.mock('../socket/state', ...)`, so the real debounced implementation isn't exercised by the suite and needed no fixture changes. Wrote and ran (then discarded) a temporary Jest test against the real (non-mocked) implementation: 4 calls fired in the same tick produced zero emissions immediately and exactly one `lobby:update` after advancing fake timers by 300ms, reproducing the review's 4-packets-to-1-packet scenario; a subsequent, separate call after that window produced its own independent second broadcast.
