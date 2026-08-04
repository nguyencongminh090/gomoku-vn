# Fix log entry — 2026-08-04 15:32

## Prompt

TODO.md #45, sub-item 5 theo `instruction.md` §B45: batch còn lại — các tooltip/title lẻ tẻ đã có khoá i18n sẵn nhưng chưa dùng (`room-ui.js:115`, `index.html:79,133`, `room.html:63`), cộng 2 mục cùng loại được gộp chung theo `instruction.md` ("làm chung 1 batch vì cùng loại lỗi"): banner reconnect ở `socket-client.js` (L189,L192) và badge/panel "online" ở `lobby.js` (L146, L155).

## Action

`client/js/room-ui.js:115` — `title="${canSit ? 'Nhấn để ngồi vào' : ''}"` → dùng khoá có sẵn `room.click_to_sit` (đã tồn tại trong `i18n.js` nhưng chưa được dùng ở đây, đúng như finding gốc ghi nhận).

`client/index.html` — `#online-count`'s `title="Đang tải..."` → `data-i18n-title="lobby.loading"` (khoá mới); `.online-panel__title` "Đang online" → `data-i18n="lobby.online_title"` (khoá mới).

`client/room.html:63` — `#btn-leave`'s `title="Rời phòng"` → `data-i18n-title="nav.leave"` (tái dùng khoá `nav.leave` đã có, phần text hiển thị của cùng nút đã dùng khoá này từ trước, chỉ riêng `title` bị bỏ sót).

`client/js/socket-client.js` — banner mất-kết-nối/đang-kết-nối-lại dùng `t('conn.disconnected_retrying')`/`t('conn.reconnecting_attempt', {n})` (2 khoá mới) thay vì literal. Thêm cache `_lastStatus`/`_lastDetail` + listener `langchange` trong `bindStatusBanner()` để banner đang hiển thị tự dịch lại khi đổi ngôn ngữ (trước đó không có).

`client/js/lobby.js` — badge `— {n} online` (hardcode tiếng Anh bất kể ngôn ngữ, đúng như finding gốc mô tả) → `t('lobby.online_count_badge', {n})`; `'Không có ai online'` → `t('lobby.no_one_online')`. Thêm biến cache `currentOnlineCount` + mở rộng listener `langchange` sẵn có (trước chỉ gọi `renderRoomList`) để re-render cả badge/danh sách rỗng khi đổi ngôn ngữ.

Thêm 8 khoá mới vào `client/js/i18n.js` (cả `vi`/`en`): `lobby.online_title`, `lobby.loading`, `lobby.online_count_badge`, `lobby.no_one_online`, `conn.disconnected_retrying`, `conn.reconnecting_attempt`.

Bump `?v=53` → `?v=54`.

## Decision

`lobby.online_count_badge`'s bản tiếng Việt đổi nội dung hiển thị thực tế khi ở chế độ Việt (trước đây luôn là "— N online" bất kể ngôn ngữ, giờ là "— N đang online" ở chế độ Việt) — đây là thay đổi có chủ đích, đúng như finding B45 gốc chỉ ra: chuỗi này *đã luôn* hardcode tiếng Anh kể cả ở chế độ Việt, chỉ "không lộ ra vì trùng ngôn ngữ hiện tại" (không phải EN mode). Sửa i18n đúng nghĩa là phải làm nó thay đổi theo ngôn ngữ, kể cả chiều VI.

## Summary output

`npm test`: 468/468 passing — không đổi (toàn bộ thay đổi trong sub-item này là client-side, không có hạ tầng test theo CLAUDE.md). `node --check` cho 4 file JS đã sửa (cú pháp hợp lệ). Grep xác nhận không còn hardcoded string trần (ngoài các attribute `data-i18n*` giữ giá trị mặc định, sẽ bị ghi đè khi `applyI18n()`/`t()` chạy).

Đây là sub-item cuối cùng của TODO.md #45 theo đúng 5 mục `instruction.md` §B45 đã liệt kê thứ tự ưu tiên — đánh dấu #45 hoàn thành trong `TODO.md`.
