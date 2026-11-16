# B396 — Storm second: one poll phase runs ~0.5 s of per-socket connect/disconnect work
**Status:** OPEN — app cuts done 2026-11-16 (fix-log 396); owner chose emit merge → #398, close after its measurement
**Area:** `server/socket/SocketHandler.js` (connection `:210`, disconnect `:397`), `DisconnectHandler.js`
(`handleDisconnect`, `startDisconnectGrace`, `cancelDisconnectGrace`), socket.io/engine.io handshake
**From:** #388 2026-11-16 (`eld.js` GAP probe + cpu-prof)   **Depends:** #394 (largest app share)

## Problem
After #388 the storm second still shows ELD max 163–265 ms (ack p99.9 157–285). GAP probe: three back-to-back gaps
(131+246+145 ms) with cpu ≈ wall, no major faults, only 3–6 ms scavenges: the server is ~97 % busy for ~1.5 s and
one libuv poll phase processes the burst. No single callback is long; it is ~1 000 × per-socket cost.
Storm app CPU (profiled): logger.info ~264 ms (#394), cancelDisconnectGrace ~247 (timer:sync + resume emits,
TimerManager.start log), disconnect path ~185, handshake/CORS/upgrade ~450 (framework), lazy `require` per disconnect.

## Scope
1. After #394, re-profile; cut the next per-socket share (e.g. hoist lazy requires, batch grace emits).
2. Consider whether the stall matters at real scale (a restart reconnects everyone) before deeper work.

## Don't
- Don't add client reconnect jitter as the fix (separate item if wanted).

## Traps
- cpu-prof busy-run analysis under-reports this: short `(idle)` slices split one poll phase. Use the `GAP` lines.

## Done when
- Storm-second ELD max and ack p99.9 before/after over ≥ 2 unprofiled runs each, in the fix-log.
