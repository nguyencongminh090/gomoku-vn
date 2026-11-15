# B392 — "See ALL tables being played, fast" vs the 30-card lobby page (#382)
**Status:** ✅ CLOSED 2026-11-15 — not needed. User: "không bắt buộc thấy hết, nhưng về cơ bản tôi muốn nói tới thời gian hiển thị và load các bàn đang chơi/mở phải nhanh". Speed goal → #389 (update cadence), #390 (first paint), #391 (join). Rule kept in B389 Traps: no load tests on the production host.
**Area:** server/socket/state.js (`_diffLobbyFull`, `_diffLobbyDirty`, `_lobbyBetter`, `queryLobbyRooms`), client/js/lobby.js (stats, "Xem thêm"), tools/perf/
**From:** user 2026-11-15 "User mới/cũ có thể nhìn thấy tất cả bàn đang chơi một cách nhanh chóng"   **Depends:** B390

## Problem
- Since #382 the lobby mirrors at most `LOBBY_ROOM_PAGE_SIZE` (30) rooms, ranked open-first then most watched. Page membership is sticky and only an OPEN table can displace a card, so a newly started game outside the page never appears by itself.
- "Xem thêm" copies are static (no live patches). Not active today (production has < 30 rooms), but it conflicts with "see all playing tables" once traffic grows.
- Also: the 2 500-game load test of 2026-11-15 ran on the SAME 8-core host as production (:3000 + cloudflared). A real game 20:55–21:02 overlapped runs 20:56–21:00, which explains the lag players reported.
## Scope
1. Decide with the user how "all live tables" should read at scale: a "Đang chơi" view that pages live games only, a live-first ranking, or larger pages. Write the chosen rule in the todo.
2. Build that rule in the server ranking + client paging, keeping the per-watcher byte bound.
3. Add a guard to tools/perf/mixed.sh: refuse to start when :3000 / cloudflared is running on the host, unless forced.
## Don't
- Return to the full room list per subscriber (3 MB at 5 000 games, #382).
## Traps
- docs/knowledge/broadcast-fanout-perf.md rule 16: "not in the page" ≠ "absent" on the client.
## Why this way
A real product choice (what a viewer sees first), so the user picks it; the perf bound stays from #382.
## Done when
- The rule chosen in step 1 is covered by lobby-delta tests; perf run off-host within the #382 byte bound.
- mixed.sh refuses to run beside a live server.
