# Fix log entry — 2026-08-04 15:08

## Prompt

Người dùng báo lại còn hardcode tiếng Việt sau khi TODO #45 đã đóng, dẫn 3 chuỗi ví dụ: "Cài đặt phòng đã được thay đổi." (x2) và "Đang vào phòng". Yêu cầu dọn sạch và đưa vào i18n để đồng bộ ngôn ngữ.

## Action

Kiểm tra "Đang vào phòng" (`client/room.html:48`) — **đã** đúng chuẩn từ trước (`data-i18n="room.entering"`, có khoá `vi`/`en` đầy đủ), không phải bug — có thể người dùng thấy nó lúc `applyI18n()` chưa kịp chạy, hoặc kiểm tra từ trước bản build có bump `?v=`.

"Cài đặt phòng đã được thay đổi." đúng là bug thật: nằm trong nhóm **system chat messages** (`chat:message`, `isSystem: true`) mà sub-item 2 của #45 (đợt sửa socket-level errors) **cố ý bỏ qua** — ghi rõ trong fix-log entry `2026-08-04-todo-45-2-socket-level-error-codes.md` là "phần việc lớn hơn, chưa làm ở fix này". Audit lại toàn bộ nhóm này phát hiện tổng cộng **27 chỗ** chưa có `code`, trải trên nhiều file hơn phạm vi sub-item 2 đã quét:

- `server/socket/handlers/RoomHandler.js` (4), `GameHandler.js` (11), `LobbyHandler.js` (1) — 16 system chat messages đã biết nhưng chưa sửa (đúng nhóm đã ghi nhận là "để sau").
- `server/socket/handlers/DisconnectHandler.js` (6) và `server/socket/state.js` (2) — **phát hiện mới**, không nằm trong audit gốc của #45 (2 file này không được liệt kê trong `docs/todo/B45-...md`).
- `server/socket/handlers/ChatHandler.js:28` (`chat:error`, không phải `chat:message`) — phát hiện mới.
- `server/middleware/auth.js` L33/41 và `server/middleware/errorHandler.js` L48 — **đã được liệt kê rõ trong `docs/todo/B45-...md`** ("cùng pattern" với `auth.js` routes) nhưng **bị bỏ sót** khi làm sub-item 1 (chỉ sửa `server/routes/auth.js`, không sửa 2 middleware này).
- `server/index.js:120` (`server:shutdown`) — phát hiện mới; hiện không có listener client nào tiêu thụ event này (kiểm tra `grep` không thấy `server:shutdown` ở client), nên không phải rò rỉ hiển thị thật, nhưng vẫn thêm `code` cho nhất quán/phòng khi có listener sau này.

Áp dụng đúng pattern đã dùng xuyên suốt #45: thêm `code` (+ `vars` cho nội dung có nội suy tên/số) song song với `text`/`message`/`error` (giữ nguyên tiếng Việt). Thêm 26 khoá i18n mới (`err.*` cho error/message, `sys.*` cho chat:message) vào `client/js/i18n.js`. `client/js/chat-ui.js` — thêm helper `systemText(msg)` ưu tiên `t('sys.' + code, vars)`, áp dụng cho cả `appendChatMessage` và `showFloatMessage`'s nhánh `isSystem`. `client/js/history.js`'s `loadGames()` error path cũng đổi sang ưu tiên `data.code` (đồng bộ với `openReplay()` đã làm ở sub-item 4).

Viết lại `server/tests/error-codes-i18n-consistency.test.js`: tách 2 họ code theo ngữ cảnh xuất hiện gần nhất (`text:` → họ `sys.*`, `error:`/`message:` → họ `err.*`) thay vì brace-matching (vốn bị nhiễu bởi `${...}` trong template literal), quét thêm 5 file mới. Thêm test file mới `server/tests/auth-middleware-error-codes.test.js` (5 case cho `verifyToken`/`errorHandler`). Mở rộng 2 test có sẵn trong `server/tests/DisconnectHandler.test.js` để pin `code`/`vars` của `PLAYER_DISCONNECTED_GRACE`/`PLAYER_RECONNECTED_RESUMED`.

Bump `?v=55` → `?v=56`.

## Decision

Không dedupe thông báo trùng giữa server chat:message và client tự dịch cho cùng sự kiện disconnect/reconnect (`DisconnectHandler.js`'s `chat:message` "X mất kết nối..." VS `room-socket.js`'s `game:interrupted` handler tự hiện `t('room.disconnected', ...)`) — cả hai đều hiện lên cùng lúc hôm nay (một bug UX có thể đã tồn tại từ trước, không phải do fix này gây ra). Ngoài phạm vi yêu cầu ("dọn hardcode tiếng Việt"), ghi nhận riêng chứ không tự ý sửa logic hiển thị kép.

Không sửa `server/scripts/admin.js` — là CLI nội bộ cho admin, không phải trang web client, không thuộc phạm vi i18n.

## Summary output

`npm test`: 503/503 passing (498 trước đó + 5 mới từ `auth-middleware-error-codes.test.js`; `error-codes-i18n-consistency.test.js` tăng từ 84 lên 88 assertion nhờ quét thêm 5 file). `node --check` cho toàn bộ file JS đã sửa. Grep lại toàn repo (`server/`, loại trừ `server/scripts/`) xác nhận không còn `text:`/`message:`/`error:` chứa tiếng Việt mà thiếu `code:` đi kèm.
