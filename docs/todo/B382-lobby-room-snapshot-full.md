# B382 — Lobby room list: full snapshot (all rooms + all moves) to every subscriber
**Status:** ✅ FIXED 2026-11-15 — one live page (30) + stats + "Xem thêm"; 3 015 KB → 18 KB at 5 000 games; browser pass done (Chromium). Uncommitted on fix/382-lobby-room-paging. Sort: open tables first, then most watched (user did not pick).
**Area:** `server/socket/state.js` (`sendLobbySnapshot`), `server/managers/RoomManager.js` (`listRooms`), `client/js/lobby.js`
**From:** perf review 2026-11-15   **Depends:** B380

## Problem
`lobby:subscribe` → `listRooms()` for everyone: measured 1.6 MB at 5 000 waiting rooms, 3.0 MB at 5 000 playing rooms (60 moves), plus the full rebuild cost of B380 per subscriber.

## Scope
1. Decide the contract (ask user): top-N / paged list, filters server-side, moves only for cards on screen.
2. Server: snapshot from the diff baseline (already serialized) instead of a fresh `listRooms()`; page it.
3. Client: request more on scroll/filter; patches for rooms it does not hold are ignored.

## Don't
- No change to the card content (#364).

## Traps
- Patches are idempotent today because every client holds every room; with paging an upsert for an unknown room must not insert a half entry (`{roomId, movesFrom, moves}`).

## Why this way
Bytes per lobby open must not grow with the room count. Note: `docs/knowledge/broadcast-fanout-perf.md`.

## Done when
- Snapshot bytes at 5 000 rooms bounded by page size; lobby-delta + jsdom lobby tests; browser pass.
