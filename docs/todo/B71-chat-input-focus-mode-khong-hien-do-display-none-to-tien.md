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

✅ ĐÃ XONG (đóng "không phải bug", 2026-08-09) — verify lại bằng browser thật, không tái hiện.

**Kiểm tra tương thích (compatibility check) trước khi làm:** đọc `client/js/room.js:127-141` phát
hiện `btnFocus` click handler đã gọi `document.body.appendChild(chatInputWrapper)` **trước khi**
(cùng lúc với) toggle class `.room--focus` lên `<body>` — tức phần tử đã được JS re-parent ra khỏi
`.panel-right-shell` (tổ tiên `display:none`) và trở thành con trực tiếp của `<body>` ngay khi bật
focus-mode, nên rule CSS `.room--focus .panel-right-shell { display:none }` không còn ảnh hưởng tới
nó nữa. `git log -S` xác nhận đoạn `document.body.appendChild(chatInputWrapper)` có từ Initial
commit (29061ad, 2026-07-10) và chưa từng bị xoá/đổi — tức logic re-parent này đã tồn tại **trước**
cả thời điểm bug được báo cáo (2026-08-08).

**Verify thực tế bằng Playwright** (guest login qua UI thật → `room.html` → click `#btn-focus`,
không cần 2 người chơi vì handler không phụ thuộc game state):
- Trước khi bật: `#chat-input-wrapper` là con của `.chat-panel`, rect `342×49`, hiển thị bình thường.
- Sau khi bật: parent đổi thành `BODY`, rect `400×47` tại `(440, 588)`, `display: flex` — **hiển thị
  đầy đủ, không phải `{0,0,0,0}` như báo cáo gốc mô tả**. Screenshot xác nhận ô chat pill nổi đúng vị
  trí phía dưới bàn cờ.
- Tắt focus-mode: parent trả về đúng `.chat-panel`, rect bình thường trở lại.
- `client/tournament-match.html` (được instruction.md nêu là nơi cần kiểm tra thêm): không có
  `#btn-focus`/`room--focus` nào cả — tính năng focus-mode không tồn tại ở trang này nên không áp
  dụng.

**Kết luận:** báo cáo gốc không tái hiện được trên code hiện tại. Có thể do khi verify #70
(2026-08-08), Playwright test khi đó không thực sự trigger qua `#btn-focus.click()` (vd. chỉ set
class trực tiếp qua `classList.add` mà bỏ qua bước re-parent trong handler), dẫn tới kết quả giả
(false positive). Không cần sửa gì thêm — đóng theo quy tắc "Security findings: verify against
current code before filing" (áp dụng tương tự cho bug report nói chung) trong `CLAUDE.md`.
