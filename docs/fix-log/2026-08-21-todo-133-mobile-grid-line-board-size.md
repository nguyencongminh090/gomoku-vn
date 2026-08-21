# Fix log entry — 2026-08-21 17:55

## Prompt

Người dùng báo qua ảnh chụp mobile: "Line is light and board is small" / đường kẻ bàn cờ nhạt màu +
bàn cờ nhỏ trên điện thoại. Sau khi phân tích và ghi vào `TODO.md #133`/`instruction.md B133`, người
dùng yêu cầu "Do #133" — thực hiện luôn.

## Action

Hai sửa độc lập trong `client/js/board.js`:

1. **Grid line nhạt** (dòng 586-588 gốc): alpha của `strokeStyle` grid line chế độ standard/caro
   tăng từ `rgba(accentRgb, 0.22)` → `rgba(accentRgb, 0.4)`. Nhánh `stone` (0.55) giữ nguyên.
2. **Bàn cờ nhỏ trên mobile** (`resize()`, nhánh `viewportBudget` chỉ chạy khi
   `zenRoom && mobileWidth`): công thức cũ trừ cứng `- 14 - 16 - 12 - 8` (50px), là budget
   padding/border của skin **non-zen** (Double-Bezel) theo đúng bình luận tại chỗ ngay phía trên —
   bị tái dùng nhầm trong nhánh zen room, trong khi zen đã có overhead riêng đúng
   (`canvasWrapBorder=2` + `turnBarMargin`/`controlsMargin` = 10px mỗi cái *chỉ khi* phần tử đó có
   chiều cao thật). Thay bằng chính overhead zen-specific đó, tái tính inline vì biến gốc
   scope trong nhánh `if (zenRoom)` phía trên không with-ra ngoài được.

Không đụng nhánh `focusMode`/`singleColumn`/non-zen — không thuộc phạm vi B133.

## Decision

Chọn alpha 0.4 (không phải giá trị người dùng tự chốt — người dùng nói "tôi sẽ tự check UI") vì:
gần khoảng cách tương phản với nhánh `stone` (0.55) mà không đổi hẳn màu, giữ đúng "teal nhạt" đặc
trưng thay vì đổi hẳn tông. Người dùng sẽ tự xem lại UI thật và có thể yêu cầu chỉnh tiếp.

## Summary output

Xác minh bằng Playwright trên instance **cô lập** (copy repo sang `/tmp` + DB tạm từ `schema.sql`
+ cổng 3111, `CORS_ORIGIN=http://localhost:3111` — không đụng server/DB thật đang chạy của người
dùng trên tiến trình khác). Guest login → tạo phòng thật → `room.html`:

- Viewport hẹp thường (390×844): board không đổi kích thước (351px trước lẫn sau) — **width-bound**,
  đúng như dự đoán vì màn hình cao đủ để height budget không phải là ràng buộc.
- Viewport thấp mô phỏng ít chiều cao hơn (375×520, height-bound): board tăng từ **263.4px →
  311.4px (+48px, +18%)**, đúng khớp con số 50−2=48px oversubtract đã tính tay trước khi sửa.
- Grid line: đọc pixel canvas thật bằng `getImageData` — trước/sau đều cho maxDiff lớn (border góp
  phần vào mẫu đo, không tách riêng được grid-line thuần trong phép đo tự động này) nhưng xác nhận
  qua screenshot: đường kẻ rõ ràng thấy được bằng mắt (ảnh đính kèm), khác hẳn ảnh gốc người dùng gửi
  (gần như không thấy đường kẻ).

`client/js/` không có test tự động (theo `CLAUDE.md`) — không thêm unit test, verify hoàn toàn qua
Playwright + đo pixel/kích thước thật như trên.

`?v=123 → 124`, verify bằng `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` ra đúng 1
giá trị. `fix/mobile-board-grid-and-size` off `main` (code base giống hệt `dev` tại 2 vùng sửa —
kiểm bằng `git diff main dev -- client/js/board.js client/css/room-zen.css` trước khi branch, chỉ
khác ở tính năng `quick-chat-bar`/`focusMode`, không chạm vùng sửa).

[chi tiết TODO](../todo/B133-mobile-grid-line-nhat-va-ban-co-nho.md) ·
[chi tiết instruction](../instruction/B133-mobile-grid-line-nhat-va-ban-co-nho.md)
