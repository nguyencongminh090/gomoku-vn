# Fix log entry — 2026-08-04 15:14

## Prompt

TODO.md #45, sub-item 4 theo `instruction.md` §B45: `client/history.html`/`client/js/history.js` nằm hoàn toàn ngoài hệ thống i18n (0 `data-i18n`, 0 lần gọi `t()` trong toàn bộ `history.js`) — mọi nhãn tĩnh, header bảng, thông báo lỗi, `alert()`/`confirm()`, và text kết quả ván đấu đều hardcode tiếng Việt.

## Action

`client/js/i18n.js`: thêm khoá `nav.lobby` (dùng chung cho link "Sảnh"/"Lobby" ở topnav, trước đây chưa có khoá vì `index.html` tự là sảnh) và 46 khoá mới namespace `history.*` (cả `vi`/`en`) — tiêu đề trang, form tìm kiếm, thống kê, bảng danh sách, replay viewer, tree panel, và các chuỗi kết quả/lý do kết thúc ván. Thêm nhánh `history` vào `updatePageTitle()` (set cả `<title>` và `<meta id="meta-description">`). Sửa thêm: `updatePageTitle()` trước đây chỉ chạy bên trong `setLanguage()`, nghĩa là user quay lại với `localStorage` đã lưu `en` vẫn thấy `<title>` tiếng Việt hardcode cho tới lần bấm đổi ngôn ngữ tiếp theo — gọi thêm `updatePageTitle()` ngay trong `DOMContentLoaded` để sửa luôn (áp dụng cho mọi trang, không riêng history, vì đây là hàm dùng chung).

`client/history.html`: gắn `data-i18n`/`data-i18n-placeholder`/`data-i18n-title` cho toàn bộ nhãn tĩnh — topnav, `<h1>`, form tìm kiếm (label + placeholder + option), khối thống kê, trạng thái "Đang tải...", toàn bộ replay viewer (nút Quay lại/Phân tích, 5 nút điều khiển replay + title, tree panel).

`client/js/history.js`: mọi `innerHTML`/`textContent`/`alert()`/`confirm()` chứa text hiển thị đổi sang gọi `t()` — lỗi tải danh sách/ván đấu, đếm số ván, header bảng (`renderGameTable`), nút "Xem lại", `confirm()` xoá nhánh, và 2 hàm kết quả `getResultText`/`getResultTextFull` (bao gồm `reasonMap` 5 lý do kết thúc). `getResultTextFull`'s `resign` case tái dùng khoá có sẵn `game.btn_resign` ("Đầu hàng"/"Resign" — đúng nghĩa cả 2 chiều, không tạo khoá trùng); fallback "Cơ bản" ở `openReplay` tái dùng `lobby.rule_basic` (khớp chính xác chuỗi cũ).

Thêm listener `langchange` (chưa từng có) tái render bảng danh sách (từ cache `lastGamesList`/`lastPagination`, không gọi lại server) hoặc thông tin replay (`renderReplayInfo`, tách ra thành hàm riêng từ `openReplay` để dùng lại được) khi đổi ngôn ngữ — theo đúng pattern `uimodechange` đã có sẵn trong cùng file.

**Ngoài phạm vi gốc của #45 nhưng cùng root cause, sửa luôn vì đường đi trực tiếp qua code đang sửa:** `server/routes/games.js:104` (`GET /api/games/:id`) cũng dùng pattern `{ error: 'Không tìm thấy ván đấu.' }` không có `code` — đúng pattern đã liệt kê trong B45 gốc ở mục "cùng pattern" của sub-item 1 nhưng chưa được sửa ở đó (chỉ `auth.js` được sửa). Thêm `code: 'GAME_NOT_FOUND'` + khoá `err.game_not_found`, `history.js`'s `openReplay` giờ ưu tiên `data.code` giống các chỗ khác.

Bump `?v=52` → `?v=53`.

## Decision

Không đổi locale `'vi-VN'` hardcode trong `formatTime()` (định dạng ngày/giờ) — đây là format locale, không phải text hiển thị rò rỉ, và không nằm trong danh sách phát hiện gốc của #45; để nguyên theo scope discipline, có thể xem xét riêng nếu có báo cáo cụ thể.

Không đổi `'Wall'`/`'Portal'` hardcode ở `openReplay` (rule labels ghép chuỗi luật) — cùng chuỗi tiếng Anh ở cả 2 ngôn ngữ nên không rò rỉ tiếng Việt, không phải bug của #45.

## Summary output

`npm test`: 468/468 passing (467 trước đó + 1 mới). Thêm `server/routes/games.js` vào danh sách file quét của `server/tests/error-codes-i18n-consistency.test.js` (từ sub-item 2) — giờ bao trùm cả `GAME_NOT_FOUND`, tổng 58 code được kiểm tra tĩnh thay vì 57. `node --check` cho `history.js`/`i18n.js` (cú pháp hợp lệ). Chưa chạy Playwright xác nhận UI thật, cùng lý do như sub-item 3.
