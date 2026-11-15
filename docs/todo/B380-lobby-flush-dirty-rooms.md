# B380 — Lobby flush rebuilds every room (per-move board throttle + every lifecycle change)
**Status:** ✅ FIXED 2026-11-15 — flush 32.4 → 0.17 ms @ 5 000 playing rooms; uncommitted on fix/380-lobby-dirty-rooms; see docs/fix-log/2026-11-15-380-lobby-dirty-rooms.md
**Area:** `server/socket/state.js` (`_diffLobbyRooms`, `broadcastLobbyUpdate`, `scheduleLobbyBoardUpdate`), `server/managers/RoomManager.js` (`listRooms`), call sites in `server/socket/**`
**From:** perf review 2026-11-15 (user: "Một nước đi khi đánh ra không được delay", target 10k+ concurrent)   **Depends:** —

## Problem
Each lobby flush calls `listRooms()`: every room is rebuilt (2 DB gets per seated player, `flatMap` of all moves, `JSON.stringify`). It runs ≤ every 2.5 s while anyone moves and ≤ every 300 ms on any room change.
Measured (micro-bench, temp DB, no DB lookups hit): 5.6 ms @ 5 000 waiting rooms, 20.5 ms @ 5 000 playing rooms (60 moves). Linear; it blocks the thread that acks moves.

## Scope
1. `RoomManager.lobbyEntry(room)` = the per-room body of `listRooms()`.
2. `broadcastLobbyUpdate(io, roomId)` / `scheduleLobbyBoardUpdate(io, roomId)` mark the room dirty; flush diffs only dirty rooms against the baseline (missing room → `removed`).
3. No `roomId` (or no baseline yet) → full diff, as today. Full diff also at most every `LOBBY_FULL_RECONCILE_MS` so changes nobody announced (avatar, rating) still reach the lobby.
4. Pass the room id at every call site (each has exactly one room in scope).

## Don't
- No wire change: `lobby:patch` / `lobby:update` payloads stay byte-identical.
- Not the per-subscriber snapshot (#382) or pagination.

## Traps
- The diff must still read live state at flush time (knowledge rule 1); the call site only names *which* room.
- A dirty room destroyed before the flush must come out as `removed` only if it is in the baseline.

## Why this way
Dirty set keeps flush cost O(changed rooms). Rejected: fingerprint per room (misses rating/avatar, easy to forget a field). Note: `docs/knowledge/broadcast-fanout-perf.md`.

## Done when
- `server/tests/lobby-delta.test.js`: one move in one of N rooms builds one entry; patch equals the full-diff patch; no-id call and reconcile still catch other rooms.
- Bench: flush cost with 5 000 playing rooms, one moved.
