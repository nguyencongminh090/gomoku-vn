# 2026-11-22 14:13 — #434 Socket stuck on long-polling after a reconnect
## Prompt
"DO #434" (report: "web lag sau khi chơi một thời gian dài"; "sau khi refresh lại ổn, mượt trở lại").
## Root cause
engine.io-client 6.6.6 with `tryAllTransports`: a reconnect whose websocket handshake errors runs
`_onError` → `transports.shift()`, so that engine's list is `['polling']`; `_filterUpgrades` then drops
websocket and no upgrade is ever probed, even after the path heals. The page stays on long-polling
(+1 RTT per back-to-back packet, e.g. game:moved + ack) until a reload builds a new engine.
## Fix
- `client/js/socket-client.js`: on every `connect`, if `engine.transport.name === 'polling'`, schedule
  `_tryReupgrade` after `REUPGRADE_DELAYS_MS[step]` (30 s, 2 min, 10 min, then give up; a websocket
  connect resets). At fire time: same socket/engine, still polling, tab visible, no #435 probe pending,
  and page hook `quietReconnectOk()` true, else recheck every 15 s. Then `engine.close()` → the SAME
  Manager reconnects websocket-first (no second socket, #145).
- `room.js` / `tournament-match.js`: `quietReconnectOk` = `SocketClient.seatIsQuiet` — false while seated
  and ready, or game `ongoing`/`interrupted` (a drop pauses the game / skips in-game grace).
  Trap for #405: an engine lease dies with its socket (no grace); a page hosting one must gate too.
- Server: `server/socket/transport-stats.js` + SocketHandler: `transport: 'polling'` on the Connected log,
  one `[Transport]` line every 10 min (live ws/polling + polling connects/upgrades since last).
- Rejected: calling engine.io's internal probe (seamless) — mangled to `tt`/`Z` in the served bundle,
  breaks silently on any socket.io bump. Polling kept in transports (#28/#29). #415 route untouched.
- Deviation from Scope (measure prod first): logging ships with the fix; `pollingConnects` still counts
  every fall-through to polling, so the prod share is measurable after deploy.
- Branch `fix/434-sticky-polling` (off dev: #435 liveness is dev-only); cache-bust `--write`, verify OK.
## Verification
- `client/tests/socket-client-reupgrade.test.js` (17) + `server/tests/transport-stats.test.js` (3); `npm test` 4650 green.
- Lab (isolated :3117, temp DB, `REUP_MS=3000 tools/perf/sticky-polling.js`): ws broken on one reconnect → polling;
  path healed → websocket again without reload (drop ~1 s < 8 s banner delay); server logged `transport=polling` on that connect.
- NOT verified: prod share of polling sockets (needs deploy, then read `[Transport]` lines); real phone;
  the user's own `RoomClient.socket.io.engine.transport.name` check before a refresh.
