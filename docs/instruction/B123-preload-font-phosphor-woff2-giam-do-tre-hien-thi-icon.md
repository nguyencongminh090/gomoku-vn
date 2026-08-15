# B123 — Preload woff2 Phosphor

Hướng dẫn thực thi cho TODO.md #123 (chưa làm).

## Cách tiếp cận khi làm

- Thêm `<link rel="preload" as="font" type="font/woff2" crossorigin>` vào `<head>` của **6 trang
  thật** (không phải mockup): `index.html`, `login.html`, `room.html`, `tournament.html`,
  `tournament-match.html`, `history.html`. Đặt **trước** dòng `<link rel="stylesheet"
  href="vendor/phosphor/...">` tương ứng, để trình duyệt ưu tiên đúng.
- Số lượng preload mỗi trang **phải khớp đúng số weight trang đó đang nạp** — đã liệt kê trong file
  todo. Đừng preload `Phosphor-Bold.woff2` ở `index.html`/`login.html` (2 trang này không nạp
  `bold/style.css` từ sau B108(a) — preload thừa sẽ lãng phí băng thông đúng lúc không cần).
- **Không đổi** `client/vendor/phosphor/*/style.css` (giữ nguyên `@font-face`/`font-display:
  swap`) — chỉ thêm hint preload, không đổi cơ chế tải hiện có.
- Đường dẫn `href` phải khớp chính xác file thật (`vendor/phosphor/regular/Phosphor.woff2`,
  `vendor/phosphor/bold/Phosphor-Bold.woff2`) — copy đúng tên file, không suy đoán.
- Bump `?v=N` toàn bộ `client/*.html` + kiểm bằng lệnh grep trong quy tắc cache-busting của
  `CLAUDE.md`.

## Xác minh

- DevTools → Network → Font: request `.woff2` phải bắt đầu sớm (gần đầu waterfall, cùng nhóm với
  CSS/JS khai báo trong `<head>`), không còn nằm ở cuối chuỗi discovery qua CSSOM.
- DevTools → Console: không có cảnh báo "The resource ... was preloaded using link preload but not
  used within a few seconds" — nếu có nghĩa là preload sai file hoặc sai định dạng.
- Kiểm tra mắt trên từng trang: icon vẫn hiển thị đúng, không icon nào rơi về tofu/box hay biến
  mất (đúng khuôn mẫu xác minh đã dùng ở B108: Chromium thật, nhiều viewport).

## Phạm vi KHÔNG làm

- Không đụng tới việc subset glyph hay bỏ weight bold — đó là B108(b)/(a), **đã đóng/đã làm riêng**,
  không gộp vào đây.
- Không thêm `modulepreload` ở đây — đó là việc khác (#126), tách riêng vì mức độ rủi ro đo đạc
  khác nhau (xem #126 — cần đo qua HTTPS/HTTP2 thật, không phải localhost).

Xem thêm: [docs/todo/B123-preload-font-phosphor-woff2-giam-do-tre-hien-thi-icon.md](../todo/B123-preload-font-phosphor-woff2-giam-do-tre-hien-thi-icon.md).
