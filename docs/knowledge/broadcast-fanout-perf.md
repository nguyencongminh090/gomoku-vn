---
name: broadcast-fanout-perf
description: How lobby, room and tournament broadcasts are kept cheap (diff/patch, debounce, coalescing, discontinuity-only timer sync, incremental render) and what the capacity tests proved about limits.
domain: gomoku-vn
tags: broadcast,socket-io,debounce,delta,lobby,tournament,capacity,performance
apply_when: "Before adding or changing any io.emit / io.to(...).emit, broadcastLobbyUpdate/broadcastRoomUpdate, tournament broadcasts, lobby rendering, or interpreting capacity/stress-test numbers"
sources: "2026-08-02-backend-todo-phan-b-8/9/10 (B8/B9/B10), 2026-08-02-capacity-stress-testing-docs-stress-test-report-md, 2026-08-04-todo-md-41-debounce-lobby-online-users, 2026-08-04-todo-md-29-unexplained-8000-player-ceiling, 2026-08-06-todo-22-room-updated-join-burst-debounce, 2026-08-06-tournament-updated-entries-diff, 2026-08-09-todo-82/83/84/87, 2026-08-14-todo-117-lobby-render-incremental; docs/stress-test-report.md (grep only); TODO #8/#9/#10/#22/#29/#41/#82/#83/#84/#87/#117"
last_reviewed: 2026-10-09
confidence: medium
---
# Broadcast fan-out and performance

## Why this note exists
Per-event cost grows with rooms x viewers x event rate. Each broadcast was first sent as a full snapshot, then trimmed one site at a time; the capacity "ceiling" took several sessions and a profiler confound before the real cause (kernel listen backlog) was found.

## Facts and rules
1. Diff at flush time from live state, not at call sites. `broadcastLobbyUpdate` (`server/socket/state.js`) diffs the room list against a per-io baseline and emits `lobby:patch { upserts, removed }`; `sendLobbySnapshot` seeds a subscriber (`lobby:subscribe`). Call sites never describe changes.
2. Client applies removals before upserts; both operations are idempotent so a snapshot overlapping a patch is safe.
3. `lobby:patch` is applied in place by `applyLobbyPatch()` in `client/js/lobby.js` (matches `data-room-id`, only falls back to full render when the list crosses empty/non-empty). Full `renderRoomList()` stays for `lobby:update`, `langchange`, `uimodechange` (#117).
4. `room:updated` uses `RoomManager.serializeRoomUpdate(room)` (no `settings`); only the `room:settings` handler sends full settings. The client MERGES (`Object.assign({}, st.roomData, data)`), because `room-ui.js`/`game-ui.js` read `roomData.settings` without optional chaining. A test sweeps `server/socket/` and pins the emit-site count; update it when adding emits.
5. `broadcastRoomUpdate()` is debounced per room: `ROOM_UPDATE_DEBOUNCE_MS = 80`, flush re-reads the live room via `roomManager.getRoom`, and `settings` is OR-ed across a burst (#22). Kept universal rather than per call site.
6. Timer traffic: `timer:sync` is emitted only at discontinuities (start, Swap2 resolution, bonus time, pause, resume, rejoin payloads). A turn switch rides inside `game:moved` as `timerSync`. Server `onTick` in `GameHandler` is a no-op; clients tick locally from `deadline` (see `server-client-clock-sync.md`). Do not reintroduce a per-second room broadcast.
7. `lobby:online_users`: `ONLINE_USERS_DEBOUNCE_MS = 1_500` (raised from 300; still a full list, delta form was deliberately not done). `LOBBY_UPDATE_DEBOUNCE_MS = 300`. Tests reference the exported constant, never hard-coded ms.
8. Tournament: `tournament:updated` sends `entries` as `{ upserts, removed }` via `_diffTournamentEntries` (snapshots keyed per tournament); register/unregister go through `_queueTournamentDetailUpdate` (`setImmediate` coalescing). Start/complete/cancel still broadcast directly (rare events).
9. Do not re-fetch after an action whose broadcast already carries the data (#82 removed a redundant `tournament:get` after register/unregister).
10. `broadcastLiveMatchesUpdate` coalesces (`_liveMatchesUpdateTimer`) and skips when the JSON equals `_lastLiveMatchesBroadcast`; it stays a full list because it is capped (`MAX_LIVE_MATCHES`, 20 rows).
11. Tournament game history is paginated: `getTournamentGames(id, limit, offset)` + `getTournamentGameCount`, route caps `limit` at 50 (#84).
12. Capacity: the apparent ~3000-4000 player ceiling was the Node `server.listen` backlog (default 511, `ListenOverflows`); fixed with `LISTEN_BACKLOG` (default 4096, `server/config.js`) -> 4000 connecting players 100% clean on default transport. Websocket-first transport was measured as a second fix; not applied in that entry, but `client/js/socket-client.js` now sets `transports: ['websocket', 'polling']` (verified 2026-10-09).
13. Profiling with `node --cpu-prof` itself dropped a 6000-player run from ~100% to 97.6%. Never use one run as both the official success-rate measurement and the profiler capture. The ~8000 boundary was left unexplained (no non-perturbing profiler available).

## Symptom -> real cause -> fix
| Symptom | Real cause | Fix |
|---|---|---|
| Connection failures at ~4000 players | listen backlog 511 | `LISTEN_BACKLOG` |
| Lobby list re-animates / slow with many rooms | patch handler re-rendered whole list | in-place `applyLobbyPatch` |
| Join bursts flood `room:updated` | many call sites firing per join | 80 ms per-room debounce |
| Capacity numbers 73-86% | profiler overhead in the measured run | separate measurement and profile runs |

## Verify before calling it fixed
- `npm test` (e.g. `lobby-delta`, `RoomManager`, `listen-backlog`, `SocketHandler` suites).
- Count packets in a test with fake timers for a burst, assert exact payload shape (patch, not snapshot).
- Capacity runs: `scripts/capacity-test/orchestrator.js` with the real DB moved aside and checksum-restored (follow `playwright-e2e-safety`); report ceiling claims from unprofiled runs only.
- Real browser: lobby with several rooms, change one, confirm other rows are not re-animated.

## Do not use when
Single-user latency/reconnect issues, or HTTP caching/CDN (see `perf-http-caching-cdn.md`).

## Related
- `be-realtime.md`, `realtime-reliability-resync.md`, `server-client-clock-sync.md`, `perf-http-caching-cdn.md`
- TODO #8/#9/#10/#22/#29/#41/#82/#83/#84/#87/#117; `docs/stress-test-report.md`
