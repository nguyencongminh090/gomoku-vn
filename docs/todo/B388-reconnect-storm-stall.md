# B388 — A 1 000-socket reconnect storm holds the game loop ~120 ms (ack p99.9 133 ms)
**Status:** OPEN
**Area:** `server/socket/SocketHandler.js` (`io.on('connection')`), `server/socket/handlers/DisconnectHandler.js`, `server/socket/state.js`
**From:** #386 load run 2026-11-15 (2 500 rooms, `tools/perf/mixed.sh`)   **Depends:** —

## Problem
After #380–#385 the storm costs ELD max 122 ms (before 538 ms) and every non-stormed table's acks around it reach 130–158 ms.
Everything else in the window is < 10 ms at p99. A real event (server restart, proxy blip) reconnects everyone at once.

## Scope
1. Profile the storm (`tools/perf/prof.js` / `--cpu-prof`) on `mixed.sh`: per-socket cost of connect + rejoin + `broadcastRoomUpdate` + lobby/online patches.
2. Fix the largest share (e.g. coalesce per-room `room:updated`, defer online-list patch) — one item per cause if several.

## Don't
- Don't add client-side reconnect jitter as the fix (it hides the server cost; can be a separate item).

## Traps
- Load client runs on the same machine; shard 0 also reconnects 200 sockets on its own loop — route wall times at the storm
  (forum/threads 1.5 s) include the client's own delay. Use server ELD, not client wall time.

## Done when
- `mixed.sh` after-run: ELD max in the storm second and ack p99.9 recorded before/after in the fix-log.
