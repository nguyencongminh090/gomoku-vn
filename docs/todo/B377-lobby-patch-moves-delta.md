# B377 — lobby:patch sends full `moves` of every moved room
**Status:** OPEN
**Area:** server/socket/state.js (_diffLobbyRooms), server/managers/RoomManager.js listRooms, client/js/lobby.js
**From:** perf/play-lag measurement 2026-11-14   **Depends:** —

## Problem
Every 2.5 s (board throttle, #364) each lobby socket gets an upsert for every room that moved, each with the
room's full `moves` array. 500 playing rooms → patches up to ~305 KB, ~110 KB/s per lobby viewer
(tools/perf/load.js). 1000 viewers ≈ 100+ MB/s server egress, shared with game traffic.
## Scope
1. Lobby entries carry `moves` as a delta: `{ movesFrom, moves }` (moves appended since the last flush);
   client splices at `movesFrom`; holds fewer than `movesFrom` → asks for a snapshot (`lobby:subscribe`).
2. Optionally cache the static part of each entry (players/ratings/settings) between board-only flushes.
3. Measure before/after with `tools/perf/run.sh` (watchers in their own process; align windows).
## Don't
- Don't change snapshot (`lobby:update`) shape; idempotency of patches must hold (see broadcastLobbyUpdate doc).
## Traps
- A socket subscribing between flushes holds a snapshot newer than the diff baseline — splice by index, never append blindly.
## Done when
- Patch bytes/viewer measured down; lobby mini boards correct in a real browser after join mid-game.
