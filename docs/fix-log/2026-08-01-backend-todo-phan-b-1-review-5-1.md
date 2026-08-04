# Fix log entry — 2026-08-01 22:48

## Prompt

Backend TODO Phần B #1 (review 5.1): restart-hang — on connection, [SocketHandler.js](server/socket/SocketHandler.js) had `if (existingRoom) { … }` with no `else`, so a client whose room no longer exists (server restarted, or the idle cleanup destroyed the room while the client was offline) was told nothing at all. Socket.io reconnects silently and `processRoomIntent()` in [client/js/room-socket.js:284-305](client/js/room-socket.js#L284-L305) only runs once per page load (`intentProcessed` latch), so no `room:join` is re-sent and the room page waits forever for state that will never arrive.

## Action

Added the missing `else` branch in [server/socket/SocketHandler.js:142-150](server/socket/SocketHandler.js#L142-L150): when `cancelDisconnectGrace()` returns false and `getRoomByUser()` finds nothing, the socket now gets `room:destroyed` with a Vietnamese message ("Phòng không còn tồn tại. Bạn sẽ được đưa về sảnh chờ."). The existing client handler at [client/js/room-socket.js:85](client/js/room-socket.js#L85) already shows a toast and redirects to `index.html` after 1.5s, so no client change was needed.

## Decision

Kept strictly to what `instruction.md` §B1 prescribes — emit the event, nothing more (no room-state persistence across restarts, no resuming games through a restart; the reviewer explicitly scoped those out). Chose `room:destroyed` over `room:left` of the two the reviewer offered, because it carries a user-visible message explaining why the page bounced, where `room:left` redirects silently. Verified the blast radius of emitting to *every* roomless connection: grepped `client/js/` and only [room-socket.js](client/js/room-socket.js) listens for `room:destroyed`/`room:left`; [lobby.js](client/js/lobby.js) (loaded on `index.html`) listens for neither, so a plain lobby connection ignores the event. No client file touched, so no `?v=N` cache-bust bump was required.

## Summary output

`npm test`: 148/148 passing, 6 suites green (was 145 before this change). Added a new `describe('SocketHandler — connection with no surviving room (restart-hang)')` block to [server/tests/SocketHandler.test.js](server/tests/SocketHandler.test.js) with 3 kept tests: (1) roomless connection receives `room:destroyed` with a string message and no `room:joined`; (2) a connection whose room still exists gets `room:joined`, joins the room, and gets no `room:destroyed`; (3) a reconnect that resumes a disconnect-grace game short-circuits before the lookup — no `room:destroyed`, `getRoomByUser` never called. All three stay permanently in the suite per the CLAUDE.md no-discard rule.
