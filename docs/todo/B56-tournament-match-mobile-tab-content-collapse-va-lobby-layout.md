# #56. Phát hiện phụ khi làm #52: `tournament-match.html` Mobile tab-content (Nước đi/Trò chuyện/Khán giả) co về ~0 chiều cao; `tournament.html`/khả năng cùng lỗi `.lobby-layout` phantom sidebar column

**Cập nhật 2026-08-07 (fix-log `2026-08-07-todo-52-full-room-refactor.md`):** Mục 1 (mobile
tab-content co về ~0 chiều cao) **đã được sửa** — không phải sửa riêng, mà là hệ quả tự động của
việc #52 chuyển sang full-refactor (tái dùng nguyên khối `.room`/`.panel-right-shell`/`.panel-right`
của `room.html`/`room.css` thay cho `.match-shell`/`.ui-shell`/`.ui-core` riêng). `room.css`'s mobile
override cho `.panel-right`/`.panel-right-shell` (đã hoạt động đúng trên `room.html` từ trước) giờ áp
dụng y nguyên cho `tournament-match.html`, không còn `max-height:480px` cụt què nữa. Đã xác minh lại
bằng Playwright (390px): `.panel-right` cao 242px với nội dung đầy đủ (thẻ người chơi, bảng điểm,
tabs), so với 76px/trống hoàn toàn trước đó. Mục 2 (`tournament.html`) **vẫn chưa sửa/chưa kiểm
chứng** — giữ nguyên bên dưới.

**Nguồn:** phát hiện khi kiểm chứng bằng trình duyệt thật (Playwright, mobile 390px) cho fix #52
(`fix/tournament-match-layout`), 2026-08-07. Không gộp vào fix #52 (rule "scope discipline" —
CLAUDE.md) vì đây là 2 lỗi khác gốc, xác nhận đã tồn tại **trước** fix #52 (tái hiện được trên cả
code trước và sau fix #52 — không phải regression do fix #52 gây ra).

## 1. Mobile: nội dung tab (Nước đi/Trò chuyện/Khán giả) trống rỗng ở `tournament-match.html`

- Ở ≤768px, `.match-shell .ui-core` dùng `height: auto; max-height: 480px` (giữ nguyên rule gốc
  trước fix #52, xem `@media (max-width: 768px)` cuối `client/css/tournament.css`). Trong 1 flex
  column không có chiều cao xác định, `.tab-content { flex: 1; min-height: 0 }` (room.css, dùng
  chung) không có "không gian trống" nào để giãn ra — đo thực tế bằng Playwright cho thấy
  `.ui-shell` chỉ cao **76px** (đúng bằng hàng nút tab), phần nội dung bên dưới hoàn toàn không
  hiển thị (đã xác minh bằng lấy màu pixel, không phải chỉ "nhìn giống trống" — vùng đó cùng màu
  nền trang, không phải 1 khối trắng riêng).
- Ảnh chụp: `before2-mobile.png`/`after2-mobile.png` (390px) trong quá trình kiểm chứng fix #52 —
  cả 2 đều lỗi giống hệt nhau.
- Cần thiết kế lại cách `.ui-core` lấy chiều cao trên mobile (ví dụ: đặt 1 `height`/`min-height` cố
  định thay vì `max-height` suông, hoặc bỏ `flex:1`/dùng chiều cao theo nội dung thật của tab đang
  active) — chưa quyết định hướng, cần xem lại cùng lúc với cách room.html xử lý tab trên mobile
  (`room.css`'s `.panel-right` mobile override chỉ bỏ `max-height`, không có vấn đề này vì
  ngữ cảnh flex khác — xem lại kỹ trước khi áp dụng y nguyên).

## 2. `tournament.html` (và khả năng `index.html` dùng cách khác) có thể chung gốc lỗi `.lobby-layout`

- `.lobby-layout` (`lobby.css`) là `grid-template-columns: 1fr 260px` — cột 260px dành cho
  `.lobby-sidebar`. `tournament.html` (trang chi tiết giải đấu) dùng `.lobby-layout` nhưng **không**
  render `.lobby-sidebar` — cùng pattern gây "khoảng trắng chết 260px bên phải" mà #52 xác nhận
  đúng là nguyên nhân chính trên `tournament-match.html`. Chưa xác minh trên `tournament.html` bằng
  trình duyệt thật (ngoài phạm vi #52 — #52 chỉ báo cáo về `tournament-match.html`), chỉ ghi nhận
  làm nghi vấn cần kiểm chứng riêng.
- Fix #52 chỉ thêm modifier `.lobby-layout--single` áp dụng cho riêng `tournament-match.html` (qua
  class trên phần tử), **không đổi** rule gốc `.lobby-layout` — nên không tự động sửa
  `tournament.html`. Nếu xác nhận đúng là cùng lỗi, có thể tái dùng chính modifier
  `.lobby-layout--single` này cho `tournament.html`.
