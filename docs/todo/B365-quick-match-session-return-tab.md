# B365 — Quick-match session (up to 3 games) + return to the entry tab
**Status:** OPEN — built 2026-11-13 on feature/365-match-rematch, uncommitted. npm test 3650/3650; browser pass (2 guests, :3101 own DB): 3 games → home in 6.2s, "Về trang chủ" → opponent sent home, #rooms create→leave → index.html#rooms. Not seen in browser: 15s timeout close (unit-tested).
**Area:** server/socket/{state.js,SocketHandler.js,handlers/GameHandler.js,handlers/MatchHandler.js}, server/managers/RoomManager.js, client/js/{room-ui.js,room-socket.js,lobby.js,i18n.js}, client/room.html, client/css/game.css
**From:** user 2026-11-13: "Với mode chơi nhanh/ghép trận ở home page. Sau khi kết thúc ván, tự chuyển người chơi về lại Home Page. Hoặc, chơi tiếp … tối đa 3 ván, sau 3 ván tự chuyển về trang chủ. Người chơi bắt đầu ở Tab Phòng, khi kết thúc sẽ trở về tab Phòng."   **Depends:** #216 (supersedes its one-game rule)

## Scope
1. Matchmade room: `matchGames`/`matchMax=3` on the room (serialized + room:updated). Each ended game counts (draws, aborted too).
2. After a game: server decision window (READY_WINDOW_MS=15s, in `readyTimers`, shown as `readyDeadline`). Both "Chơi tiếp" (= room:ready) → next game; else room closes `MATCH_NO_REMATCH`.
3. At 3/3: room:ready refused `MATCH_LIMIT_REACHED`; room closes after 5s `MATCH_SESSION_DONE`.
4. A seated player leaving (button, disconnect timeout, forfeit) → RoomManager `match_abandoned` → room closes for the other `MATCH_OPPONENT_LEFT`.
5. Close = `room:destroyed` + socketsLeave + `_destroyRoom` (`state.closeMatchRoom`). Client toasts and goes home.
6. Client: #start-modal turns into "Xong ván n/3 · Chơi tiếp (ván n+1/3) · Về trang chủ" with countdown.
7. Return tab: lobby.js `roomHref()` adds `?from=rooms` when entering from `#rooms`; room-socket `exitUrl()` → `index.html#rooms`; matchmade always `index.html`.

## Don't
- No auto-ready after game 1 (a reload between games uses `matchGames>0`).

## Traps
- `handleGameEnd` runs before `game:ended` is emitted → closing is always deferred (timer / setImmediate).
- Seat lock (user 2026-11-13 "Không cho phép đổi người khi ghép trận chơi nhanh"): `room.matchPlayers`; sitDown by others / standUp → `MATCH_SEAT_LOCKED`; 3rd ready-miss seat kick → `match_abandoned`. UI hides stand + sit buttons in matchmade.

## Done when
- server/tests/match-session.test.js, client/tests/room-matchmade-no-start-modal.test.js, client/tests/room-return-tab.test.js green; real-browser pass.
