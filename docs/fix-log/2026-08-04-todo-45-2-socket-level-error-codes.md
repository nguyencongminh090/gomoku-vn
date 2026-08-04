# Fix log entry — 2026-08-04 14:35

## Prompt

TODO.md #45, sub-item 2 theo `instruction.md` §B45: socket-level error/message i18n. `GameEngine.js`, `RoomManager.js`, `ChatHandler.js`, và các `*Handler.js` (`GameHandler`, `RoomHandler`, `LobbyHandler`, `SocketHandler`) gửi lỗi tới client bằng chuỗi tiếng Việt cố định (`{ error: '...' }` / `{ message: '...' }`), luôn hiển thị nguyên văn qua `alert()`/`showToast()`/`ChatUI.appendSystemMessage()` bất kể ngôn ngữ client — cùng root cause với sub-item 1 (`server/routes/auth.js`), chỉ khác lớp (socket thay vì REST).

## Action

Áp dụng đúng pattern đã dùng ở sub-item 1: thêm field `code` (language-neutral) song song với `error`/`message` (tiếng Việt, giữ nguyên không đổi) ở **mọi** nhánh lỗi của:
- `server/managers/GameEngine.js` (35 chỗ `return { error: ... }`)
- `server/managers/RoomManager.js` (25 chỗ)
- `server/managers/ChatHandler.js` (1 chỗ — rate limit)
- `server/socket/handlers/GameHandler.js` — 8 message hardcode mới + forward `code` từ `result.error`/`r.error` ở mọi `socket.emit('game:error', { message: result.error })`
- `server/socket/handlers/RoomHandler.js` — 2 message hardcode + forward `code` ở mọi `{ message: result.error }`
- `server/socket/handlers/LobbyHandler.js` — 1 message hardcode + forward `code`
- `server/socket/SocketHandler.js` — 5 message hardcode (`room:destroyed`, `room:error`, `session:kicked`)

Nhiều chuỗi tiếng Việt trùng lặp qua nhiều dòng/file (VD "Ván đấu đã kết thúc." xuất hiện ở cả 6 chỗ trong `GameEngine.js`) — dùng chung 1 code (`GAME_OVER`) cho mỗi chuỗi giống hệt nhau, áp dụng bằng script Python thay vì sửa tay từng dòng để tránh gõ nhầm code cho các chuỗi giống nhau.

`client/js/i18n.js`: thêm 55 khoá mới `err.<code_lowercase>` vào cả `TRANSLATIONS.vi`/`TRANSLATIONS.en` (giữ invariant "không thiếu khoá nào cả 2 chiều").

`client/js/room-socket.js`: thêm helper `serverMessage(data)` — ưu tiên `t('err.' + data.code.toLowerCase())`, fallback `data.message` nếu không có `code` (đường phòng thủ cho các event tương lai chưa gắn code). Áp dụng cho `room:kicked`, `room:destroyed`, `room:error` (cả 2 nhánh), `chat:error`, `game:error`.

`client/js/lobby.js`: `room:error` handler dùng cùng logic ưu tiên `code`.

Bump `?v=50` → `?v=51`.

## Decision

**Không** đụng vào các system chat message có nội dung động (interpolate displayName/số đếm — VD `` `${user.displayName} đã rời phòng.` ``, `'Ván đấu bắt đầu! Đen đi trước.'` ở `GameHandler.js:667`, thông báo Swap2/xin-thêm-giờ...) — đây là phần việc lớn hơn, cần thêm cơ chế `code` + `vars` (tương tự `room.disconnected`/`game.draw_offer` đã dùng interpolation `{name}`) và sửa nhiều điểm gọi ở `chat-ui.js`. `instruction.md` §B45 liệt kê rõ đây là phần riêng trong sub-item 2 ("Message hệ thống trong chat... nên theo cùng cơ chế code→key thay vì text cứng") — ghi nhận là còn lại, chưa làm ở fix này, để giữ đúng scope discipline (một fix không phình to thành 2 loại thay đổi khác bản chất: lỗi tĩnh vs. thông báo có tham số).

Cũng không đổi `client/js/socket-client.js`'s `session:kicked` handler — nó không hiển thị `data.message` (chỉ set flag rồi để `login.html` tự hiển thị `t('login.session_kicked')` đã có sẵn), nên không có gì rò rỉ ở đường đó dù server giờ cũng gửi kèm `code: 'SESSION_KICKED'` cho nhất quán.

## Summary output

`npm test`: 467/467 passing, 23 suites (410 trước đó + 57 mới). File test mới: `server/tests/error-codes-i18n-consistency.test.js` — kiểm tra tĩnh mọi `code` xuất hiện trong 7 file server có khoá `err.<code>` tương ứng ở **cả** `TRANSLATIONS.vi` và `TRANSLATIONS.en` (57 code, mỗi code 1 test qua `test.each`), cộng 1 test giữ invariant "vi/en cùng bộ khoá". Cập nhật `server/tests/GameHandler.test.js` (2 assertion cũ thêm `code: 'NOT_A_PLAYER'`) và `server/tests/LobbyHandler.test.js` (3 assertion mới cho `ALREADY_IN_ANOTHER_ROOM`, `MISSING_ROOM_ID`, `ROOM_NOT_FOUND`) để không bị vỡ bởi field mới và pin luôn hành vi forward `code`.
