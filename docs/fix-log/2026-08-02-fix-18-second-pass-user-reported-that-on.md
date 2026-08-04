# Fix log entry — 2026-08-02 20:45

## Prompt

Fix #18 second pass — user reported that on the real deployment (play3cr.dpdns.org) room creation failed on essentially every attempt, not just under contrived heavy Playwright parallel load: server logs showed `Room #X created` immediately followed by `Disconnected` then `Room #X destroyed (empty)`, repeatedly. The first-pass fix ([TODO.md #18](TODO.md), overlay-only) never touched this — it only hid the visual flash, leaving the underlying room-destroy race untouched.

## Action

Reintroduced the empty-room grace mechanism from the reverted attempt, this time scoped only to the disconnect path and without the ack-before-navigate client change that caused the original revert: [server/config.js](server/config.js) adds `EMPTY_ROOM_GRACE_MS` (20s default); [server/socket/state.js](server/socket/state.js) adds `emptyRoomGraceTimers`; [server/socket/handlers/DisconnectHandler.js](server/socket/handlers/DisconnectHandler.js) starts a bounded grace timer instead of destroying immediately when the disconnecting user is the room's sole occupant, extracting `finalizeNormalLeave()` shared with the grace-expiry path; [server/socket/SocketHandler.js](server/socket/SocketHandler.js) cancels the grace timer on every new connection, before the existing `getRoomByUser` auto-rejoin check runs.

## Decision

The explicit `room:leave` handler (`RoomHandler.js`) is untouched and still destroys immediately — grace only applies to unexpected disconnects (page navigation, network drops), never an intentional leave. Chose to resurrect the grace approach rather than continue with overlay-only because the risk calculus changed: the earlier revert was driven by fear that any finite timeout could be defeated by a slow-enough connection, but that was weighed against a baseline that "usually worked"; the real-world evidence now shows the no-grace baseline fails on effectively every attempt, so a bounded grace is a strict improvement, not an added risk.

## Summary output

`npm test`: 294/294 passing (5 new tests in `server/tests/DisconnectHandler.test.js`, plus mock updates in `SocketHandler.test.js`/`flood-protection.test.js`). Mutation-checked: reverting `DisconnectHandler.js` alone made all 5 new tests fail as expected, restoring it made them pass again.
