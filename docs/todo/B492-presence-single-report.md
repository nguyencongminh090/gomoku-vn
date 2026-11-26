# B492 — Presence: one report per edge on the room page (PS-7)
**Status:** ✅ DONE 2026-11-27 — socket-client.js: URL `?id` → `auth.roomId` on the first room-page handshake; no `presence:set` on the room page. Server untouched (existing roomId check covers fresh loads). Done-when 1 shown by two jsdom suites (socket-client: no report on room page; room-socket-strict-presence: one per edge) rather than one combined suite. Fix-log 2026-11-27.
**Area:** client/js/room-socket.js, client/js/socket-client.js
**From:** features/presence-status (planning F1), 2026-11-27   **Depends:** #486
## Scope
1. Room page sends one event per visibility/focus edge (drop the duplicate `room:presence` or `presence:set`).
2. Server keeps accepting both events (old cached clients).
3. F3 (confirmed by #486): `socket-client.js:160` forces `presence:set` on connect before `room:join`, and the `existingRoom` branch marks a fresh load (no `auth.roomId`) away → one false away + extra `room:updated`. Candidate: server treats `auth.roomPage === true` + the member's room as the room page until `room:join`.
## Traps
- Fixing F3 flips the last assertion of `presence-emit-baseline.test.js` — intended, not a regression.
## Done when
- jsdom test loading socket-client.js + room-socket.js counts 1 emit per visibility edge (the #486 harness calls handlers directly, so it cannot count client emits).
- F3 baseline test flipped: no away flash on a fresh room-page load.
