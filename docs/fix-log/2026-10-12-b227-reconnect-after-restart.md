# 2026-10-12 03:21 — #227 Open pages never reconnect after a server restart
## Prompt
"Do #227"
## Root cause
`gracefulShutdown` → `io.disconnectSockets()`; client sees reason `io server disconnect`, which socket.io
deliberately never auto-retries, and no client code handled it. (SIGKILL = transport close → retried.)
## Fix
- `client/js/socket-client.js` `disconnect` handler: on `io server disconnect`, `socket.connect()` after
  1–5 s jitter (no boot stampede), setting `auth.reconnect=true` like the manager path. `?v=309`.
- Kick/lock: `session:kicked` runs `destroy()` first (`this.socket` null) → never retried. Other server
  `disconnect(true)` (flood streak) now also reconnects after the jitter — accepted, flood limiter re-trips.
- Existing `connect`/resubscribe handlers (lobby, home) run on the new connection as on any reconnect.
## Verification
- `client/tests/socket-client-server-disconnect.test.js` (6). `npm test`: only the known load flakes
  (compression, B210 home link) fail in the full run; both green alone.
- Real browser (scratchpad copy, own DB, :3107): index.html open, SIGTERM server → socket disconnected, new server started → reconnected 2.3 s after restart, no reload, 0 console errors.
