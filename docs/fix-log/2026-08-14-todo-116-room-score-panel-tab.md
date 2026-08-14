# Fix log entry — 2026-08-14 13:00

## Prompt
Người dùng báo cáo qua chat kèm ảnh chụp màn hình mobile: "Score Board took space of Chat Box on
phone." Bản ghi đầu trỏ nhầm vào `client/tournament-match.html` (2 trang dùng cấu trúc gần giống
hệt); người dùng xác nhận qua `AskUserQuestion` đúng phạm vi là `client/room.html`.

## Action
`.score-panel` (`#score-panel`, bảng điểm Thắng/Bại/Hoà) nằm cố định trong `.panel-players`, phía
trên `.sidebar-tabs` — luôn hiển thị đè lên bất kể tab nào đang active, đẩy khung chat co lại chỉ
còn ~2 dòng trên màn hình hẹp. Hỏi lại người dùng trước khi code (tab riêng vs ẩn có điều kiện,
phạm vi mobile-only hay mọi kích thước, tên tab + i18n key, mở rộng sang `tournament-match.html`
hay không) — người dùng chọn: tab riêng, áp dụng mọi kích thước màn hình, chỉ `room.html`.

Sửa: `client/room.html` gỡ `.score-panel` khỏi `.panel-players`, đặt vào tab-content mới
`#tab-score` (nút tab thứ 2 sau "Trò chuyện", icon `ph-trophy`, i18n key `room.tab_score` mới cho cả
vi/en trong `client/js/i18n.js`). `client/js/room-ui.js`'s `renderScoreTable()` đổi từ toggle
`scorePanel.style.display` sang toggle `.tab-btn[data-tab="tab-score"].style.display` + bật lại tab
Trò chuyện nếu tab điểm đang active mà vừa hết dữ liệu — cùng khuôn mẫu đã dùng cho `tab-users`.
`client/css/room.css` giữ nguyên rule `.score-panel` gốc (vẫn phục vụ `tournament-match.html`),
thêm `#tab-score .score-panel` riêng. `client/css/room-zen.css` thêm `body.zen-room #tab-score
.score-panel` để không cộng dồn padding với `.tab-content` trong skin zen.

## Decision
Không đụng `tournament-match.html` — người dùng chọn "chỉ room trước", theo dõi riêng sau này nếu
cần. `?v=` 119→120. Xác minh bằng Playwright thật (2 guest, viewport 390×844, db thật đã di dời
sang `.pre-e2e` theo `playwright-e2e-safety` trước khi khởi động server thử nghiệm, khôi phục sau):
tab điểm ẩn tới khi có kết quả (đúng như tab Khán giả), sau khi đầu hàng hiện đúng cột T/B/H và dữ
liệu đúng, khung chat giữ nguyên chiều cao đầy đủ ở cả 2 trạng thái. `npm test` 1138/1138.

Việc này ban đầu được thực hiện trực tiếp trên `dev` (không qua `fix/*`); sau đó tách lại đúng quy
ước — chuyển nội dung sang `fix/room-score-panel-tab` off `main`, merge vào `main` rồi `dev`, để
`main` cũng có bản sửa này thay vì chỉ tồn tại trên `dev`.

## Summary output
TODO.md #116: bảng điểm phòng chơi (`room.html`) chuyển từ vị trí cố định (chiếm chỗ chat trên
mobile) sang tab riêng `#tab-score`, ẩn/hiện theo cùng khuôn mẫu tab-users; `tournament-match.html`
giữ nguyên (ngoài phạm vi lần này). `?v=` 119→120, `npm test` 1138/1138, xác minh Playwright thật
2 guest mobile 390×844.
