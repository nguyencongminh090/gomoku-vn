# B71. Ô chat focus-mode không hiện do tổ tiên display:none (TODO.md #71)

**Nguồn:** phát hiện lúc verify #70 bằng Playwright thật, TODO.md #71.

## Cách tiếp cận

- Đây **không phải** CSS-only — nguyên nhân gốc là cấu trúc DOM (`#chat-input-wrapper` lồng trong
  `.panel-right-shell`), không sửa được chỉ bằng đổi giá trị CSS. Cần 1 trong 2:
  - Dời `#chat-input-wrapper` ra khỏi `.panel-right-shell` trong `client/room.html` (và
    `client/tournament-match.html` nếu dùng chung cấu trúc — kiểm tra trước).
  - Hoặc JS re-parent lúc toggle `room--focus` trong `client/js/room.js`/`client/js/room-socket.js`
    (xem `document.body.classList.toggle('room--focus', ...)` ở `room.js:130`).
- Nếu chọn dời trong HTML: kiểm tra JS có `querySelector`/`getElementById('chat-input-wrapper')`
  nào phụ thuộc vị trí DOM cụ thể (ví dụ `nextElementSibling`, `parentElement`) trước khi dời — tra
  cứu `client/js/room.js`, `client/js/room-socket.js`, `client/js/board.js`.
- Verify bằng browser thật (Playwright hoặc `run` skill): bật focus-mode, xác nhận ô chat thực sự
  render (không chỉ đọc CSS), gõ thử 1 tin nhắn, gửi thành công, tắt focus-mode và xác nhận sidebar
  trở lại bình thường không mất trạng thái.
- Sau khi sửa xong, nhớ bump `?v=N` nếu đổi file trong `client/js/` (đổi HTML thì không cần theo
  quy tắc cache-busting hiện tại, nhưng kiểm tra lại quy tắc trong `CLAUDE.md` trước khi bỏ qua).
