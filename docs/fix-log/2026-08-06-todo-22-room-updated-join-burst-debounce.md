# Fix log entry — 2026-08-06 00:59

## Prompt

User: "Check for broadcast, when to full-state. Optimize broadcast for performance." Surveyed all
broadcast call sites (lobby, room, tournament, gameplay) and presented findings; user picked two
targets to implement now, one of which was TODO.md #22 — the stress-test-documented finding that a
burst of spectators joining one room near-simultaneously causes `room:updated` fan-out cost to scale
quadratically with room size (~1+2+...+19 sends for 19 near-simultaneous joins), because
`broadcastRoomUpdate()` fired synchronously on every call with no coalescing, unlike
`broadcastLobbyUpdate()`/`broadcastOnlineUsers()` which already debounce. TODO #22 itself had flagged
this as measured-but-not-prioritized ("chưa đủ bằng chứng để coi đây là ưu tiên sửa ngay"); the user's
explicit selection is what promoted it from "known, deprioritized" to "implement now."

## Action

Added a per-room debounce to `broadcastRoomUpdate()` in [state.js](server/socket/state.js), mirroring
the existing `broadcastLobbyUpdate()` coalesce-then-flush pattern but scoped per `roomId` instead of
server-wide:

- Split the diff+emit body into `_emitRoomUpdate(io, room, opts)` (unchanged logic, just renamed) and
  a new debounced `broadcastRoomUpdate(io, room, opts)` wrapper.
- `ROOM_UPDATE_DEBOUNCE_MS = 80` — a `Map<roomId, Timeout>` (`_roomUpdateTimers`) plus a
  `Map<roomId, {io, settings}>` (`_roomUpdatePending`) accumulate calls within one window; only the
  `settings` boolean is carried across calls (OR'd, so a `{settings:true}` call earlier in a burst
  isn't lost if a later call in the same burst omits it) — the actual room state is always re-read
  live via `roomManager.getRoom(roomId)` at flush time rather than captured per-call, since
  `RoomManager` mutates rooms in place (confirmed no call site replaces the Map entry except
  `createRoom`), so a fresh lookup at flush time is already current.
- Flush guards against the room having been destroyed mid-window (`roomManager.getRoom()` returning
  `null`) — skips the emit rather than broadcasting stale/undefined state.
- `clearRoomUpdateSnapshot(roomId)` (already called from `SocketHandler.js`'s `room_destroyed`
  listener) now also cancels any pending timer and drops the pending-state entry for that room, so a
  scheduled flush can't fire after teardown and timers don't accumulate over server uptime.

80ms was chosen over reusing `LOBBY_UPDATE_DEBOUNCE_MS` (300ms) because room-level broadcasts cover
more latency-sensitive actions (sit/ready/kick feedback) than the lobby-wide room list; 80ms is well
below human reaction time (nobody perceives an 80ms delay on a UI update) while still wide enough to
coalesce a realistic join burst.

## Decision

Kept the debounce **universal** (every `broadcastRoomUpdate()` call site, ~17 of them) rather than
special-casing only the join path, because: (a) the existing delta/diff logic already makes a
same-state re-broadcast a no-op, so the debounce's only behavioral cost is a bounded 80ms delay, not
extra network traffic; (b) singling out "join" as a special path would need every call site to declare
its own intent, reintroducing exactly the kind of per-call-site coupling the diff mechanism was
designed to avoid (see `_diffRoomUsers`'s doc comment); (c) 80ms is short enough that no existing test
or real usage pattern depends on sub-80ms synchronous delivery — verified by running the full suite
including `GameHandler.test.js`/`DisconnectHandler.test.js`/`LobbyHandler.test.js` (all of which mock
`state.js` wholesale and were unaffected) and `RoomManager.test.js`.

Rewrote [room-update-delta.test.js](server/tests/room-update-delta.test.js) — its previous top comment
explicitly documented `broadcastRoomUpdate()` as "not debounced... fires synchronously," which this fix
intentionally changes. Added `jest.useFakeTimers()` + a `flush()` helper (mirroring
`lobby-delta.test.js`'s own pattern) to every existing case, plus 6 new cases covering the debounce
itself: single-flush-per-burst, one-timer-per-room (not one-per-call), independent per-room flushing,
the settings-flag-not-lost-across-a-burst case, the room-destroyed-mid-window skip, and
`clearRoomUpdateSnapshot` cancelling a pending flush.

Deliberately did NOT touch `GameHandler.test.js`'s `RoomManager` mock (it lacks a `getRoom` stub
entirely) — that file mocks `../socket/state` wholesale via `jest.mock`, so the real debounced
`broadcastRoomUpdate()` (and its `roomManager.getRoom()` call) is never reached from that suite; adding
an unused mock method there would be scope creep unrelated to this fix.

## Summary output

`npm test`: 508/508 passing on `main` (this fix's scope — the tournament feature's ~200 additional
tests live only on `dev`/`feature/*` branches and aren't part of this baseline). Confirmed the fix
doesn't regress `DisconnectHandler.test.js`'s pre-existing (unrelated) hang-without-`--forceExit`
behavior — reproduced identically on `main` before this change via `git stash`, so not a regression
introduced here.
