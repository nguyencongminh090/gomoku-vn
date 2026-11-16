# B391 — Joining a table: room.html opens its socket only after the whole module graph
**Status:** ✅ DONE 2026-11-15 — [fix-log](../fix-log/2026-11-15-391-room-early-socket.md)
**Area:** client/room.html (head), client/js/socket-early.js, client/js/room.js (`new SocketClient()` → `SocketClient.shared()`), client/js/room-socket.js (`processRoomIntent`)
**From:** user 2026-11-15 "thời gian vô bàn nhanh"   **Depends:** —

## Problem
Joining a table navigates the whole page (`window.joinRoom` → room.html), so each join pays a fresh
TCP+TLS+WebSocket handshake through Cloudflare. #145 put `socket-early.js` in index.html's `<head>`
(it measured 462 ms lost before the socket opened). room.html never got it: `room.js:47` does
`new SocketClient()` after 13 deferred modules (~456 KB, unbundled) load and run. The server side is
not the cost: `room:join` is in-memory, and room.html is served in ~1 ms locally.
## Scope
1. Measure click → DOMContentLoaded → `connect` → `room:joined` (Performance marks) on an isolated server with Cloudflare-like latency (CDP throttling).
2. Load socket-early.js in room.html's `<head>`. room.js takes the shared client (`SocketClient.shared()`) instead of creating its own.
3. Re-measure; record the numbers in the fix-log.
## Don't
- Make the join a single-page transition (no reload). That is size L, see Why.
- Change `room:join` server semantics.
## Traps
- Two SocketClients on one page = the server's single-device eviction kicks the player (#51, #145). Exactly one `shared()` call path.
- `processRoomIntent` runs on `connect`. With an early socket, `connect` can fire before room-socket.js listens. room-socket.js:59 already calls `processRoomIntent()` when the socket is already connected, and the `intentProcessed` flag stops a second emit. Keep both.
- Client edit → `node scripts/cache-bust.js --write`; playwright-e2e-safety for the browser pass.
## Why this way
Same proven fix as #145, small and reversible. Rejected for now: SPA join (keeps the socket, but a cross-page architecture change, L); bundling (toolchain change).
## Done when
- jsdom: room page creates exactly one socket, and `room:join` is emitted once whether `connect` comes early or late.
- Real browser: `connect` starts before module evaluation ends; join time measured before/after; `npm test` green.
