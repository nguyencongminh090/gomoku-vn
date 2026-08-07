# B61. `.match-clocks` quá sát `#match-meta` trên PC (`tournament-match.html`) — TODO.md #61

**Nguồn:** review nhanh UI desktop theo yêu cầu người dùng, 2026-08-07. Chưa có bug report gốc từ
người dùng cuối — đây là phát hiện qua review chủ động, không phải báo cáo lỗi trực tiếp.

## Phạm vi

- `client/tournament-match.html` — cấu trúc DOM dòng ~49-79: quan hệ anh-em (không lồng nhau) giữa
  `.match-page-header` (chứa `.detail-header` → `#match-meta`) và
  `<main class="room"><section class="board-area-shell"><div class="match-clocks">`.
- `client/css/tournament.css`:
  - `.match-page-header` (dòng ~158-165) — hiện không có margin/padding đáy.
  - `.detail-header__meta` / `.detail-meta-item` (dòng ~34-36) — kiểm tra chiều cao dòng, khả năng
    wrap, khoảng cách dưới.
  - `.match-clocks` (dòng ~167) — hiện chỉ có `margin-bottom: 16px`, không có `margin-top` riêng để
    tách khỏi header phía trên.
- `client/css/room.css`:
  - `.room` (dòng ~8-20) — `padding-top: 12px` hiện là nguồn khoảng cách duy nhất giữa
    `.match-page-header` và nội dung `.room`. Cần đối chiếu xem giá trị này có đang bị dùng lệch mục
    đích gốc (thiết kế cho `room.html`, vốn không có `.match-page-header` phía trên) hay không —
    **đừng chỉnh `.room` một cách vô điều kiện** vì `room.html` cũng dùng chung class này; ưu tiên
    thêm khoảng cách ở phía `tournament.css` (match-specific) trước.

## Hướng tiếp cận đề xuất

- Thêm khoảng đệm dọc ở phía `.match-page-header`/`.detail-header__meta` (margin-bottom hoặc
  padding-bottom) và/hoặc `margin-top` riêng cho `.match-clocks`, thay vì đụng vào `.room` dùng
  chung với `room.html`.
- Test ở nhiều độ rộng desktop (1280/1440/1920px) và với text meta dài hơn thực tế (nhiều điều kiện
  đấu, tên giải đấu dài) để xác nhận khoảng cách mới đủ ở mọi trường hợp, không chỉ trường hợp ảnh
  chụp gốc.
- Vì đây là thay đổi CSS thuần (không đụng JS/logic), theo "Bug-fix workflow" trong CLAUDE.md: phần
  `client/js/` hiện không có test infra tự động — verify bằng cách chạy `run` skill / xem trực tiếp
  trên trình duyệt (desktop viewport), không có unit test tương ứng để viết.
- Nhớ bump `?v=N` cache-bust nếu file CSS bị sửa (theo quy tắc "Cache-busting version bump" trong
  CLAUDE.md) — kiểm tra đủ cả `client/*.html` lẫn mọi `import '...?v=N'` trong `client/js/*.js`.

## Ranh giới

- Đây là lỗi visual/layout thuần túy, không phải lỗi vùng click hay hành vi tương tác — không cần
  đụng tới `client/js/tournament-match.js`.
- Không mở rộng sang refactor bố cục tổng thể trang (đã có #52 riêng cho việc đó) — giữ phạm vi hẹp
  ở khoảng cách dọc giữa `#match-meta` và `.match-clocks`.
