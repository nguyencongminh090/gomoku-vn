# Phòng tab redesign (R1 "Sảnh gỗ") — User story

Status: **decided 2026-11-13** (user picked R1 from 8 mockups, see [planning.md](planning.md)); build = #364.
Diagrams: [lobby board sequence](diagram/uml_diagram/lobby-board-sequence.md), [card states](diagram/card-states.md).

## Actors
Lobby visitor (member or guest), seated players, server (RoomManager + lobby patch).

## Stories
1. Opening Phòng, I see a photo hero with live counts (bàn chờ đối thủ · ván đang đấu · người đang xem · online) and the two entries: room code (3 boxes) and Tạo phòng.
2. Rooms are table cards in a grid: a live game shows its current position as a mini board, players with rating, elapsed time and watchers; an open table shows an empty board and a big "Ngồi vào".
3. The mini board refreshes while I look, a few seconds behind the game.
4. Phòng / Bàn / Quan sát filters, row click = join/watch, online names → PM keep working.
5. On a phone the hero is short (title + 4 counts) and the code + Tạo phòng sit in one row, so the first card is visible.

## Rules / hard constraints
- Board/stones lock: the mini board is a small static SVG in lobby.js, not BoardRenderer; the game board is untouched.
- Lobby traffic bounded: positions ride the existing diffed `lobby:patch`, flushed at most once per LOBBY_BOARD_THROTTLE_MS per server after moves.
- Ratings only for members, in the room's rule category; guests show none.
