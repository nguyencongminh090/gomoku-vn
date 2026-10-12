# B227 — After a server restart, open pages never reconnect
**Status:** ✅ FIXED 2026-10-12 — see fix-log b227
**Area:** server/index.js (gracefulShutdown), client/js/socket-client.js
**From:** found during #225 real-browser pass, 2026-10-12   **Depends:** —

## Problem
`gracefulShutdown` (SIGTERM) emits `server:shutdown` then `io.disconnectSockets()`. The client sees
disconnect reason `io server disconnect`, which socket.io deliberately does NOT auto-retry, and no client
code handles it or `server:shutdown` (grep: 0 hits). Repro (#225 pass, scratchpad copy on :3107): page open
on index.html, SIGTERM the server, start it again → no reconnect in 20 s; with SIGKILL it reconnects in ~2 s.
So every deploy restart leaves every open tab (rooms, lobby, dashboard) disconnected until reload.
## Scope
1. Client: on `disconnect` with reason `io server disconnect` (or on `server:shutdown`), call
   `socket.connect()` after a jittered delay (avoid a reconnect stampede at boot).
2. Keep a server-initiated kick (`session:kicked`, locked account) from reconnecting — it already destroys.
3. Test (jsdom socket-client suite) + real-browser SIGTERM restart pass.
## Don't
- Don't drop `disconnectSockets()` from shutdown (needed so `server.close` finishes).
## Traps
- Check whether other server-side `socket.disconnect(true)` calls (kick/evict) would now be retried.
- Lobby (`lobby.js`) emits `lobby:subscribe` once at load; verify it is re-sent after any reconnect (B226).
## Done when
- SIGTERM restart → an open page reconnects and resyncs without reload; tests green.
