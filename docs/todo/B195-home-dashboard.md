# B195 — R2: "Chơi" home dashboard + "Phòng" screen (existing data only)
**Status:** OPEN — implemented 2026-10-09 on `feature/195-home-dashboard` (uncommitted); jsdom + backend tests + real-server pass (sandbox :3100) done; awaiting user review
**Area:** server (1 read route) + client (index.html screens)
**From:** features/platform/planning.md § Release 2 (R2); "Phòng" nav deferred from R1 (decision 5)

## Scope
- `GET /api/home` (session optional, rate-limited like rankings), in-memory only, no DB:
  - `myGame`: room the user sits in (RoomManager.getRoomByUser) → roomId, roomName, state, opponent, rule, timer, myTurn.
  - `myMatches`: tournament pairings with the user as a player, state ≠ Completed, not byes → tournament name, round, opponent, state, agreedTime/deadline, link ids.
  - `tournaments`: status draft|active, ≤ 5, `registered` flag (not entryUserIds of others).
  - `live`: playing rooms, top 3 by viewers (userCount − seated): names, viewers, boardSize, stones `[x,y,c]` (c 1|2) from moveHistory.
- Client: index.html gets 3 screens driven by the shell nav/hash: `#`→Chơi (dashboard), `#rooms`→Phòng
  (today's tables panel), `#tournaments`→Giải đấu. Old Bàn chơi|Giải đấu section tabs removed.
  Dashboard = greeting h1 + psplit: left "Ván đang chơi" rows (Vào ván / Chi tiết); right "Hôm nay"
  (tournaments) + "Đang phát trực tiếp" (SVG mini board, viewers, link = spectate join). Poll /api/home 20 s while visible.
- Shell nav adds "Phòng" (`/index.html#rooms`).
## Don't
- Quick match (R3), puzzle/club events in "Hôm nay" (R6/R7), bell (R4). No fake buttons.
- No board.js/game.css change; mini board is its own small SVG.
- Never expose other users' ids/IP; guests get live + tournaments only.
## Traps
- `?tab=tournaments` legacy link must still work. `[hidden]` vs class display (B192/B193).
- Pairing states: Paired/Negotiating/Reported/Ready/…/Completed; byes have player2EntryId null.
