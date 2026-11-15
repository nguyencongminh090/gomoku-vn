# 2026-11-15 18:04 — #382 lobby room list: one live page + counts, "show more" on demand
## Prompt
Review → user agreed (2026-11-15) to "gửi một trang đầu (ví dụ 30 phòng) và lọc phía server"; sort order not chosen → open tables first, then most watched (my default).
## Root cause
`sendLobbySnapshot` sent `listRooms()` — every room with all its moves, 2 DB gets per seated player — to each lobby subscriber (3.0 MB / 34 ms at 5 000 games), and the diff baseline mirrored all rooms on all clients.
## Fix
- Server (`state.js`): the baseline is a page of ≤ `LOBBY_ROOM_PAGE_SIZE` (config/env, 30) rooms. Sticky membership; a new open table evicts the least-watched non-open card; a freed slot is refilled from outside; the 30 s full pass re-ranks. Per-io tally over all rooms (`RoomManager.lobbyStat`, no DB) → `stats {rooms, open, live, watch}` on `lobby:update`/`lobby:patch` only while truncated (≤ one page of rooms → payloads byte-identical). Snapshot = live entries of the page. New `lobby:rooms_query {offset}` (ack, 200 ms throttle) returns the next page of the ranking as one-off copies.
- Client (`lobby.js`): hero counts from `stats`; `#rooms-more` button after the grid ("Xem thêm (N bàn nữa)") appends rooms not held; CSS `.rooms-more` in `rooms-hall.css`; i18n `lobby.rooms_more`.
- Found by the replay test while building: a card upserted then evicted in the same pass came back on clients → upserts filtered to the page. Branch `fix/382-lobby-room-paging` (stacked on #381).
## Verification
- `lobby-delta.test.js` +20 (`room list page (#382)`: identical payload at one page, rank, eviction, refill, stats-only patch, reconcile, snapshot+patch replay == server page, query paging); `LobbyHandler.test.js` +2; jsdom `lobby-rooms-page.test.js` (9). `npm test`: 224 suites / 3965 pass. cache-bust OK.
- Bench (5 000 playing rooms × 60 moves): snapshot 3 015 KB / 34 ms → 18 KB / 0.21 ms; flush with 1 000 rooms moved 5.8 → 1.6 ms, patch 62 KB → 2 KB; rooms_query 1.5 ms.
- Real browser (Chromium, isolated server :3117, page size 4, 12 rooms): 4 cards, hero 12 open, "Xem thêm (8 bàn nữa)" → 8 → 12 → button gone; closing a room updates cards + counts; button 366×52 px at 390 px, no horizontal overflow; 0 console errors.
- NOT verified: real phone/Safari; load run; "show more" cards are static (a destroyed one fails on click with the server's room:error).
