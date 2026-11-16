# 2026-11-15 21:42 — #391 room.html opens its socket in <head> (socket-early), room.js takes the shared client
## Prompt
"do #391" (from user 2026-11-15 "thời gian vô bàn nhanh").
## Root cause
room.html never got #145: `room.js` did `new SocketClient()` after 13 deferred modules, so `io()` ran 692 ms after
navigation (cold, below). Latent second bug: room-socket.js's "already connected" check called `processRoomIntent()` above
`let intentProcessed` → TDZ ReferenceError aborting the module; reachable once the socket connects early (jsdom test caught it).
## Fix
room.html `<head>`: session.js → socket.io.min.js → socket-client.js → socket-early.js above every stylesheet; foot socket.io
tag + 2 modulepreloads removed. room-entry.js drops both imports (#51). room.js `SocketClient.shared()`. room-socket.js: the
"already connected" `processRoomIntent()` moved to module end. 3 old test stubs got `static shared()`; preload count 12 → 10.
## Verification
`client/tests/room-early-socket.test.js` (14): head order, no double import, single `?v=`, shared(), one `io()`, join/create
emitted once for early and late connect. `npm test` 230 suites / 4 017 green; cache-bust OK.
Browser: `SP=<scratch> tools/perf/room-join-timing.sh <label> [reload]` — isolated :3118, fresh DB, headless Chromium 390×844,
CDP latency 150 ms + 1.25 MB/s + CPU ×4, 5 runs, median ms since room.html navigation; cold = first visit, warm = second.

| ms | before cold | after cold | before warm | after warm |
|---|---|---|---|---|
| io() called | 692 | 207 | 262 | 205 |
| socket connect | 858 | 377 | 423 | 367 |
| DOMContentLoaded | 705 | 697 | 269 | 251 |
| room:joined | 865 | 734 | 426 | 371 |

One io() per page, `RoomClient === __gvnSharedClient`, 0 page errors. Gain −131 cold / −55 warm, not −481: `room:join` is
still emitted by room-socket.js after the module graph → #393.
Reload (3 runs, seated player mid-game): on-connect pushes (timer:sync, game:resumed, game:init, room:joined, ~360 ms) now
land before room-socket.js listens (~700 ms) and are dropped; the page's own idempotent `room:join` restores it: moves 2/2,
overlay hidden, clock right, next move accepted, 0 errors. No module imports session/socket-client transitively.
Not verified: real phone over the real Cloudflare tunnel (CDP latency is not a TLS handshake).
