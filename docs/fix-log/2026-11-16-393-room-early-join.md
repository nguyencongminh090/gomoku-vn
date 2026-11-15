# 2026-11-16 03:53 — #393 room:join emitted from <head> on connect; replies held until room-socket.js registers
## Prompt
"Do #393"
## Root cause
After #391 the socket connects at ~370 ms (cold), but the room:join/create emit lived in room-socket.js, the last deferred
module (~DCL 700 ms), so the join waited on client module time. Meanwhile the server's on-connect pushes
(timer:sync, game:resumed, game:init, room:joined) arrived before any handler and were dropped.
## Fix
- `socket-client.js`: `holdEvents()` (onAny records each event + listeners that got it live), `releaseEvents()` (replays
  to listeners added since, arrival order, once, per-event try/catch rethrown async; HOLD_MAX 500), `replayAgeMs()`.
- New classic `room-early-join.js` in room.html <head> after socket-early.js: holds events, emits the intent on first
  `connect` via `window.RoomIntent.send()` — the one once-guarded intent reader (create intent too).
- `room-socket.js`: processRoomIntent() delegates to RoomIntent.send (bare-link redirect kept; REQUIRES the head script —
  Vite's classic-script scanner copies it), releaseEvents() at module end; clock offset input `receivedAt() = Date.now()
  − replayAgeMs()` so a replayed serverTime isn't read stale (TimerSyncCore formula untouched).
- Deviation from Traps ("replay on first on()"): explicit release at module end — replaying on the first
  `on('room:joined')` would run the handler mid-evaluation of room-socket.js (#391 TDZ class) and out of order.
## Verification
`room-early-socket.test.js` +15: real socket.io-client onAny-before-listeners, replay once/ordered/capped, throwing handler
isolated, replayAgeMs, head emit → replayed room:joined + clock from arrival, room:error replay, reconnect/create/bare link.
`npm test` green; cache-bust OK. Browser `room-join-timing.sh` (new `handled` mark = overlay starts hiding), same session,
latency 150 + CPU ×4, median ms: dev(#391) vs #393 — wire joined cold 742 → 428, **handled cold 770 → 747**, warm 380 → 395
(noise). DCL cold 693 → 747 because the replayed handler now runs inside room-socket.js evaluation (handled ≈ DCL).
CDP does not throttle WebSocket frames, so this harness cannot show the intended gain: handled was module_end + RTT, is now
max(module_end, connect + RTT) — ≈ one real WS RTT saved in production. Reload (3 runs, seated mid-game): overlay hidden,
moves 2/2, clocks 9:57/10:00, clock skew −2…−16 ms, next move accepted, 0 errors, 1 io().
Not verified: the production RTT gain (real phone over the Cloudflare tunnel); a `vite build` of dist/.
