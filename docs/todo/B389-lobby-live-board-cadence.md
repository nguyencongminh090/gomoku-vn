# B389 — Rooms tab live boards land 0.3–2.8 s after the move ("lúc nhanh lúc chậm")
**Status:** DONE 2026-11-15 (cf2e22b; perf: lobby 1.1 → 2.1 KB/s per watcher, server cost unchanged)
**Area:** server/socket/state.js (`scheduleLobbyBoardUpdate`, `LOBBY_BOARD_THROTTLE_MS`, `_scheduleLobbyFlush`), server/tests/lobby-delta.test.js
**From:** user 2026-11-15 "Room cập nhật đôi lúc bị trễ, có thể là do cập nhật theo đợt (có lúc nhanh/lúc chậm)"   **Depends:** —

## Problem
One per-server board timer starts at the FIRST move after a flush and fires 2.5 s later, then the 300 ms
lobby debounce runs. So a move that starts a window shows on the cards ~2.8 s later, and a move made
just before the timer fires shows ~0.3 s later. Card lag is uneven by design (#364). Seat, start and end
changes go through `broadcastLobbyUpdate`, which uses only the 300 ms debounce.
## Scope
1. Measure the move → `lobby:patch` delay distribution now (jest fake timers + tools/perf watcher).
2. Lower and even out the delay. The board flush is bounded by the 30-card page since #382, not by the
   room count, so a shorter throttle (e.g. ~1 s) or a per-room trailing flush is affordable.
3. Re-measure bytes per watcher (tools/perf/mixed.sh, OFF the production host — see B392).
## Don't
- Emit per move to the lobby (rejected in #364: traffic ∝ moves).
- Touch `room:updated` / `game:moved` (room page path).
## Traps
- #377 moves delta and #380 dirty set must still hold. A shorter window means more upserts but smaller ones; check with lobby-delta tests.
- Run perf tests only on a machine that is NOT serving play3cr (B392).
## Why this way
#382 bounded each flush to the 30 mirrored rooms, so #364's 2.5 s traffic budget is now loose. Knowledge: docs/knowledge/broadcast-fanout-perf.md rules 14–16.
## Done when
- Jest: a move's upsert reaches the lobby within the new bound regardless of where in the window it falls.
- Perf run: ≤ the agreed KB/s per watcher at 2 500 rooms; `npm test` green.
