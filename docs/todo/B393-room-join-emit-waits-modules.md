# B393 — room:join is still emitted only after room.html's module graph
**Status:** OPEN
**Area:** client/room.html (head), client/js/socket-early.js, client/js/room-socket.js (`processRoomIntent`)
**From:** #391 measurement 2026-11-15   **Depends:** #391

## Problem
After #391 the socket connects at ~377 ms (cold, latency 150 ms, CPU ×4) but `room:joined` lands at ~734 ms: the
`room:join` emit lives in room-socket.js, the last of 11 deferred modules (~DOMContentLoaded 697 ms).
## Scope
1. Emit the join intent from a classic `<head>` script on `connect` (read `gvn_room_intent` / `?id=`), buffering the
   `room:joined`/`room:error` payload until room-socket.js registers its handlers.
2. Re-measure with `tools/perf/room-join-timing.sh`.
## Don't
- SPA join (size L). Change `room:join` server semantics.
## Traps
- Since #391 the server's on-connect pushes (session:me, timer:sync, game:resumed, game:init, room:joined) arrive before
  room-socket.js listens and are dropped; today the page's own room:join re-fetches state. An earlier emit needs a
  SocketClient buffer (queue events with no listener, replay on first `on()`), or the reply is lost the same way.
- Exactly one emit per page load (intent consumed once); reconnects must not re-emit the intent.
- The board/UI needs the buffered `room:joined`; missing it leaves #room-entry-overlay up forever (#40).
## Why this way
The remaining cost is client module time, not network; only moving the emit earlier removes it without bundling.
## Done when
- jsdom: one emit, payload replayed to late handlers; browser: joined ≈ connect + 1 RTT; `npm test` green.
