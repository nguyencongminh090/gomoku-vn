# B435 — Silently dead socket: up to ~45 s of nothing, own chat lost, no banner
**Status:** ✅ CLOSED 2026-11-24 (fix on dev, deployed prod; closed on user request, real-phone check not done) — fix built + deployed prod 2026-11-22 (4bdbebb7; steps 2+3, lab 39.9→8.7 s, [fix-log](../fix-log/2026-11-22-435-dead-socket-liveness.md)); real-phone check open
**Area:** client/js/socket-client.js (heartbeat / liveness), client/js/room-socket.js, room.js chat send
**From:** user (viewer) 2026-11-22: "sau một thời gian, tôi bị lag (thời gian của người đang chơi về 0:00 + nhắn tin nhưng ko thấy tin nhắn của mình). Sau đó, tôi refresh … nhắn tin và hiện ngay lập tức."   **Depends:** #415, #434

## Problem
When the live TCP path dies silently (NAT rebinding, phone network switch, VN→CF loss) the client
still reads `connected`. engine.io only notices at `pingInterval + pingTimeout` (server defaults
25 s + 20 s = 45 s after the last ping). Meanwhile: no packets arrive, the local clock ticks to 0:00,
`chat:message` emits go into the dead transport and are lost for good (own chat shows only via
server echo, and the emit is not buffered/resent because the socket was `connected`), and no
reconnect banner shows. A refresh opens a new TCP connection → works at once.

Evidence (2026-11-22, `tools/perf/bhproxy.js` + `tools/perf/viewer-dead-socket.js`, viewer page,
bot chats every 2 s, existing connection blackholed at t=0, new connections allowed):
`ping timeout` at 38.8 s → reconnect 39.9 s → chat flows at 40.1 s. Bot messages c2–c21 (≈40 s)
never reached the viewer; the viewer's own message sent at t=1 s was lost.

## Prod measure (step 1, pm2 out log 2026-11-17 → 11-22 14:04, before deploy)
`ping timeout` = 187 of 3211 disconnects (5.8 %; 8.5 % of network-driven: transport close 2008, transport
error 9); 36 of 104 users hit it, top 3 users = 66; 7–58/day. After the fix a dead old socket is mostly evicted
by the reconnect (`server namespace disconnect`) before it times out — re-count to compare.

## Scope
1. Measure prod: share of `reason="ping timeout"` disconnects (logs already carry `reason`).
2. Faster liveness on the client (e.g. app-level ping with ack timeout ~5–8 s → close engine so the
   same Manager reconnects), and/or lower server `pingInterval`/`pingTimeout`. Decide after 1.
3. Chat send: ack + retry or "not sent" state instead of silent loss.

## Don't
- Don't create a second socket/Manager (#145/#367/#391).
- Don't touch `/diag` ping settings (diag-namespace.test.js asserts they are untouched).

## Traps
- Repro server needs `CORS_ORIGIN=http://localhost:3117,http://localhost:3118`.
- CDP network emulation doesn't affect websockets; use the blackhole proxy (SIGUSR2).

## Done when
- Dead path detected and recovered in ≤ ~10 s in the blackhole repro; own chat never silently lost.
