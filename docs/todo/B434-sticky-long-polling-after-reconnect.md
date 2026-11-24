# B434 — Lag after long play: socket stuck on long-polling after a reconnect
**Status:** ✅ CLOSED 2026-11-24 (fix on dev, deployed prod; closed on user request, residual prod polling-share + real-phone check not done) — fix merged dev 1e0486d5, deployed prod 2026-11-22 14:36 +07. Prod browser check (guest, 390 px, real 30 s backoff):
ws broken on one reconnect → `polling` (server log `reconnect=1 transport=polling`); healed → `websocket` 30.2 s later, no reload, net:ping acked.
Left: prod polling share from `[Transport]` lines (every 10 min), real phone. [fix-log](../fix-log/2026-11-22-434-sticky-long-polling.md)
**Area:** client/js/socket-client.js (`_connect` opts), server/socket/SocketHandler.js (logging)
**From:** user report 2026-11-22 "web lag sau khi chơi một thời gian dài"; "sau khi refresh lại ổn, mượt trở lại"   **Depends:** #415

## Problem
Client uses `transports: ['websocket','polling']` + `tryAllTransports: true` (engine.io-client 6.6.6).
On a reconnect whose websocket handshake ERRORS (network switch, phone resume, lossy VN→CF leg),
`_onError` does `this.transports.shift()` → engine list = `['polling']` (verified in page), so
`_filterUpgrades` drops websocket and NO upgrade is ever attempted, even on a healthy link → one ws
error on any reconnect pins the page to HTTP long-polling until the next disconnect. Reload opens a fresh engine (websocket first) → smooth again. Matches both reports.

Evidence (2026-11-22, isolated server :3117, `tools/perf/sticky-polling.js` + `delayproxy.js`; long run `tools/perf/long-session.js`, delay proxy 50 ms one-way):
- ws broken for one reconnect → `polling`; ws path healed → still `polling` at +5/+30/+60 s; reload → `websocket`.
- Single packet: ws 53 ms vs polling 54 ms (no difference).
- Burst of 3 packets 15 ms apart: ws all ~53 ms; polling 2nd/3rd = 127–145 ms (+1 RTT each).
  Every move = `game:moved` + ack back-to-back to the mover. Unmeasured: uplink POST serialization
  (a move queued behind the 2 s presence POST) and the cost under real packet loss (prod RTT ~98 ms).
Ruled out in lab (40 games × 40 moves + 400 chats, desktop + 390 px, CPU 4×): per-move handler time,
heap, listeners, intervals, AudioNodes (0 live with running ctx) all flat. Client page has no leak.

## Scope
1. Log transport on connect and on `upgrade`/`upgradeError` server-side (count sockets on polling) — measure prod first.
2. Client: detect a connection that came up on polling; after a backoff close the engine so the same
   Manager reconnects websocket-first (no "retry upgrade" knob exists). Confirm per report first:
   console `RoomClient.socket.io.engine.transport.name` before refresh → `"polling"`.

## Don't
- Don't drop `polling` from transports (blocked-websocket networks need it, #28/#29).
- Don't touch the #415 direct→CF fallback here (separate: it survives reload for DIRECT_OFF_MS 15 min, so it doesn't match "refresh fixes it").

## Traps
- CDP `Network.emulateNetworkConditions` / `setBlockedURLs` do not affect websockets; use a TCP delay proxy and a failing WebSocket URL (CSP-refused) to reproduce.
- Repro server needs `CORS_ORIGIN=http://localhost:3117,http://localhost:3118` (else AUTH_ORIGIN via proxy); `echo $!` after `cd … && node &` can record a stale pid — kill by port.
- One Manager per page (#145/#367/#391): never create a second socket to "upgrade".

## Done when
- Prod numbers: share of sockets on polling; regression test: page on polling returns to websocket without reload.
