# Phần A #1. TLS/HTTPS trước app (review 3.0) — Nghiêm trọng nếu đang chạy HTTP trần

**Trạng thái:** ✅ đã xong (2026-08-02) — xem chi tiết bên dưới. Đánh dấu lại
2026-08-08 để đồng bộ với `TODO.md` (index trước đó thiếu `✅` dù mục này đã
xong từ lâu — sync bug theo rule "Index/detail sync" trong `CLAUDE.md`, không
phải thay đổi nội dung).

**Nguồn:** `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)


#### 1. TLS/HTTPS trước app (review 3.0) — Nghiêm trọng nếu đang chạy HTTP trần

- Cần: đặt reverse proxy có TLS (Caddy hoặc nginx) trước `node server/index.js`.
  Caddy rẻ nhất — tự xin/gia hạn Let's Encrypt.
- Kèm theo bắt buộc trong `server/index.js`: `app.set('trust proxy', <đúng số hop>);`
  — thiếu dòng này thì `express-rate-limit` gộp mọi người dùng vào chung IP của
  proxy, khoá nhầm người thật; set sai (quá rộng) thì `X-Forwarded-For` giả mạo
  được và bypass rate limit.
- Nếu dùng Caddy: block `handle /socket.io*` phải đặt **trước** catch-all.
- **✅ Đã xác nhận + sửa xong (2026-08-02):** deploy thật dùng **Cloudflare
  Tunnel** (`cloudflared`, chạy cùng máy, kết nối vào Node qua loopback) — TLS
  do Cloudflare xử lý, coi như xong phần này. Phần code còn thiếu (`trust
  proxy` + đọc `X-Forwarded-For` ở tầng socket) đã sửa, xem TODO.md mục #30 và
  `docs/fix-log.md`.
