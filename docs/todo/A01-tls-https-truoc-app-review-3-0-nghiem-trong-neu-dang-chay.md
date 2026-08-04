# Phần A #1. TLS/HTTPS trước app (review 3.0) — Nghiêm trọng nếu đang chạy HTTP trần

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
