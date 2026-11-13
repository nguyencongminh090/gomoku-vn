# Phòng tab redesign — planning

Scope: `index.html#rooms` (`#panel-tables`, rendered by `client/js/lobby.js renderRoomList`). Not room.html.
Mockups: `mockups/r1…r8.html` fragments + `common.css`, injected into the real page by `shoot.js`
(isolated server `PORT=3101 GOMOKU_DB_PATH=<scratch>.db node server/index.js`). Fixture = 7 rooms; frames
also `-sparse` (1 room) and `-busy` (16). Gallery: `gallery/index.html` → https://claude.ai/artifact/TLd7a8nQNaDHrxZKWVMhWC
Photos: Pixabay 3339748 (R1), 1579841 (R2), credits in `img/stock-credits.json` (img/, shots/ gitignored).

## Directions
- R1 Sảnh gỗ — photo hero with live counts + code/create; table-card grid with mini boards.
- R2 Trà & cờ — rows + right "host desk" (photo, inline create form, code, online with status).
- R3 Sơ đồ sảnh — top-down hall: each room a table with chairs; empty chair = Ngồi.
- R4 Màn hình TV — featured live game + wall of live boards + "Ghế trống" queue.
- R5 Hai làn — "Ngồi vào là chơi" vs "Đang đấu — vào xem" lanes + quick-create presets.
- R6 Bảng khởi hành — split-flap departure board, status flaps, online ticker. No backend needed.
- R7 Câu lọc — Home-style sentence = filter + create preset.
- R8 Bento sảnh — tiles: Ghế trống, Ván nóng nhất, code, presets, list, online.

## Data map
Already sent by `listRooms`: name, code, host, both players + avatarUrl, playerCount, userCount
(viewers = userCount − playerCount), state, board size, rule flags, timer, ranked.
Needs backend: live position (mini boards; per-move lobby traffic), clocks, ratings, elapsed time,
room wait time, per-user online status.

## Decisions 2026-11-13
- R1 Sảnh gỗ chosen. Mini boards: backend sends moves in the lobby patch, throttled (not every move).
- Add player rating + game elapsed time. Phone hero compact (title + counts; code + create in one row).
- Build now as #364 on feature/364-rooms-photo-hall; see [user_story.md](user_story.md).

## Open questions (pre-decision)
1. Which direction (or mix)?
2. Backend items to add, if any (mini boards are the big one).
3. Quick-create presets (R5/R8) — which 3?
4. Photo or no photo (Home DESIGN.md forbids photos on home)?
