# B127 — Gộp CSS theo trang (STRICT — dễ vỡ layout)

Hướng dẫn thực thi cho TODO.md #127 (chưa làm — **làm sau cùng**, cùng nhóm STRICT với #126).

## Trước khi bắt đầu

- Đọc `docs/todo/B127-...md` — mục "Yêu cầu bắt buộc" bắt buộc thực hiện, không phải gợi ý.
- Branch riêng, `git status` sạch trước khi sửa, không sửa trực tiếp bản đang phục vụ qua tunnel
  lúc có người chơi thật (cùng lý do với B126 — Cloudflare Tunnel forward localhost thật).

## Cách tiếp cận khi làm

1. **Grep trước khi sửa:** liệt kê mọi class trong `client/css/lobby.css` đang thật sự được dùng ở
   `room.html`/`room-ui.js`/`game-ui.js`/`chat-ui.js` — nếu có (dù chỉ 1-2 class), phải giữ lại
   chúng (chuyển vào `room.css` hoặc `main.css` tuỳ ngữ nghĩa) trước khi bỏ hẳn `<link>` `lobby.css`
   khỏi `room.html`. Đừng bỏ `<link>` rồi mới phát hiện thiếu style.
2. Bỏ `<link rel="stylesheet" href="css/lobby.css?v=N">` khỏi `room.html` sau khi bước 1 xác nhận
   an toàn.
3. Cân nhắc gộp thêm `room.css`+`room-zen.css`+`game.css`+`settings-panel.css` nếu muốn giảm round-
   trip hơn nữa — **không bắt buộc**, review chỉ nói "công bằng mà nói, 1 file lớn không tự động
   tốt hơn". Nếu không chắc lợi ích rõ ràng, chỉ làm bước 1-2 là đủ.
4. Bump `?v=N` theo quy tắc cache-busting.

## Xác minh — bắt buộc bằng trình duyệt thật, không suy đoán

- `room.html` chế độ thường + zen-mode (nếu còn áp dụng), đủ 4 tab (Chat/Bảng điểm/Khán giả/Cài
  đặt), desktop + mobile 390×844 — theo đúng khuôn mẫu B108/B116/B118 đã dùng trong repo này.
- Nhìn kỹ: không có style nào bị mất (nút, layout, spacing), không có FOUC rõ rệt hơn trước.
- Nếu dùng Playwright: theo `playwright-e2e-safety` skill — không chạm database thật, dùng session
  hợp lệ theo hướng dẫn của skill đó.

## Phạm vi KHÔNG làm

- Không gộp CSS của các trang khác (`index.html`, `login.html`, `tournament*.html`) trong cùng lần
  sửa này — phạm vi chỉ `room.html` theo đúng finding của review.
- Không đổi biến CSS (`--c-*`, `--board-*`) hay bất kỳ token nào đang LOCKED theo comment trong
  `main.css`/`room.css` — chỉ gộp/tách file, không đổi giá trị style.

Xem thêm: [docs/todo/B127-gop-css-theo-trang-bo-lobby-css-thua-o-room.md](../todo/B127-gop-css-theo-trang-bo-lobby-css-thua-o-room.md).
