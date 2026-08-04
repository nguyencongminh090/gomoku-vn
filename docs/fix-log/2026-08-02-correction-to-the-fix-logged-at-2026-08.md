# Fix log entry — 2026-08-02 00:30

## Prompt

**Correction to the fix logged at 2026-08-01 22:48 (TODO Phần B #1, restart-hang).** Browser-verifying TODO Phần B #3 with Playwright (installed by the user after that row was written) surfaced a regression that fix introduced: creating a room bounced the user straight back to the lobby and destroyed the new room. Cause — the `else` branch emitted `room:destroyed` on *every* roomless connection, but the room page opens its socket **before** it sends `room:create`/`room:join` (`processRoomIntent()` runs on the `connect` event), so a first connect is legitimately roomless. The client toasted and redirected after 1.5s, its socket dropped, and `RoomManager` destroyed the now-empty room. The 2026-08-01 22:48 row's stated reasoning ("the lobby page does not listen for room:destroyed, so telling every roomless connection is a no-op") checked the wrong page: the room page listens, and it is the one that connects roomless.

## Action

Gated the branch on a new `reconnect` flag in the Socket.io auth handshake: [SocketHandler.js:142](server/socket/SocketHandler.js#L142) now emits only when `socket.handshake.auth.reconnect` is set, and [client/js/socket-client.js:57-70](client/js/socket-client.js#L57-L70) sets it from the Manager's `reconnect_attempt` (`this.socket.io.on(...)` — in Socket.io v4 the Manager, not the socket, owns reconnect events), so it is true only for a connection replacing an earlier one. Bumped `?v=27` → `?v=28` across all 45 occurrences.

## Decision

A first connect can never be distinguished from a lost room by server state alone — the joiner has no membership until `room:join` arrives either — so the client has to say which it is; the auth handshake carries it without a new event or a round trip. Left the pre-existing socket-level `reconnect_attempt` status listener alone (it feeds the connection banner) rather than repointing it at the Manager: that is a separate latent bug (it never fires under v4), noted for `TODO.md` instead of folded in here.

## Summary output

`npm test`: 174/174 passing, 8 suites green. `SocketHandler.test.js` gained two regression tests — a first connect (no `auth.reconnect`) gets no `room:destroyed`, and a socket with no `handshake` at all is treated as a first connect — and its three existing restart-hang tests now connect with the flag set. Verified in a real browser (Chromium/Playwright, guest sessions against a live server): **before** — create room → immediately bounced to `index.html`, room destroyed; **after** — create room → stays on `room.html?id=#7DY` with `roomData` populated. Re-ran the review's actual 5.1 scenario end-to-end by SIGKILLing the server under a live client and restarting it: on this build the client reconnects and lands back on the lobby; on a worktree at pre-fix commit `0079f8f` the same script leaves the client sitting on a dead `room.html?id=#NJS` forever — the hang the fix targets, now confirmed against real code rather than inferred.
