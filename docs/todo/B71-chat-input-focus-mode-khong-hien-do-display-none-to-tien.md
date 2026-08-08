# Phần B #71. Ô nhập chat ở focus-mode không hiện được (display:none tổ tiên)

**Nguồn:** phát hiện trong lúc verify #70 bằng browser thật (Playwright, guest login → tạo phòng
→ bật `room--focus`), 2026-08-08. Không phải bug do fix #70 gây ra — đã tồn tại từ trước, #70 chỉ
vô tình phơi bày nó khi verify UI thật thay vì chỉ đọc code.

## Vấn đề đã xác nhận

`client/room.html` đặt `#chat-input-wrapper` (chứa input + nút "Gửi") lồng bên trong
`.panel-right-shell` (sidebar chat/khán giả/cài đặt). `client/css/game.css` có 2 rule liên quan:

1. `.room--focus .panel-right-shell { display: none !important; }` — ẩn toàn bộ sidebar khi bật
   focus-mode (đúng ý đồ: focus-mode phải ẩn sidebar để nhường chỗ cho bàn cờ).
2. `.room--focus #chat-input-wrapper { position: fixed; bottom: 85px; ... }` — ý đồ để riêng ô chat
   "thoát ra" khỏi sidebar, nổi đè lên bàn cờ.

Nhưng theo CSS spec, `position: fixed` không giúp phần tử thoát khỏi trạng thái ẩn của **tổ tiên**
có `display: none` — tổ tiên `display:none` loại bỏ toàn bộ cây con (kể cả hậu duệ `position:fixed`)
khỏi render tree. Verify bằng Playwright xác nhận: `getComputedStyle(wrapper).display` = `flex`
(đúng), nhưng `getBoundingClientRect()` = `{x:0,y:0,width:0,height:0}` — phần tử tồn tại trong DOM,
CSS áp đúng, nhưng không được vẽ ra màn hình. Kết quả: tính năng "chat nổi trong focus-mode" hoàn
toàn vô hình trong production, bất kể nội dung CSS của rule 2 là gì.

Bug #70 mục 3 (đồng bộ style nút gửi chat focus-mode) đã sửa đúng token/style của rule 2 — nhưng
sửa đó **không có tác dụng hiển thị nào** cho tới khi bug #71 này được xử lý, vì cả khối rule 2
chưa từng vẽ ra được.

## Việc cần làm

Chọn 1 trong 2 hướng (không phải CSS-only, cần chạm HTML hoặc JS):

- **HTML:** dời `#chat-input-wrapper` ra khỏi `.panel-right-shell`, đặt làm con trực tiếp của phần
  tử chứa `.board-area` (hoặc `body`), rồi CSS chỉ cần ẩn/hiện nó qua chính rule
  `.room--focus #chat-input-wrapper` mà không phụ thuộc trạng thái `display` của sidebar nữa.
- **JS:** khi bật/tắt `room--focus` (xem `client/js/room.js`, `client/js/room-socket.js`), re-parent
  `#chat-input-wrapper` ra ngoài `.panel-right-shell` lúc bật, trả về lại lúc tắt.
- Sau khi sửa, verify lại bằng browser thật (không chỉ đọc code) rằng ô chat thực sự hiện, nổi đúng
  vị trí, nút "Gửi" đúng style đã đồng bộ ở #70.

## Trạng thái

Chưa làm.
