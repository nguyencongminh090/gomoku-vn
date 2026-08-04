# A1. TLS/HTTPS (review 3.0)

### A1. TLS/HTTPS (review 3.0)

- Caddy là lựa chọn rẻ nhất — tự xin và tự gia hạn Let's Encrypt, app không cần
  biết gì về chứng chỉ, vẫn nói HTTP trần ở cổng nội bộ.
- **Bắt buộc đi kèm:** `app.set('trust proxy', 'loopback');` (hoặc đúng số hop
  thật) trong `server/index.js`. Thiếu dòng này → `express-rate-limit` gộp mọi
  người dùng vào chung IP proxy, khoá nhầm người thật thay vì kẻ tấn công. Set
  **quá rộng** → `X-Forwarded-For` giả mạo được, bypass rate limit — phải set
  đúng số hop, không phải set rộng cho chắc.
- **Không được đụng vào:** `client/js/socket-client.js:40` gọi `io({...})`
  không truyền URL — socket.io tự chọn `wss://`/`ws://` theo origin trang, đây
  đã đúng sẵn. Không hardcode `ws://` ở đây.
- **Nếu dùng Caddy:** block `handle /socket.io*` phải đặt **trước** block
  catch-all, nếu không catch-all nuốt mất đường socket — lỗi hay gặp khi dựng
  lần đầu.

**✅ Đã xác nhận + sửa (2026-08-02):** deploy thật dùng Cloudflare Tunnel,
đúng 1 hop qua loopback — khớp chính xác gợi ý ở trên.
`app.set('trust proxy', 'loopback')` đã thêm vào `server/index.js` (sửa crash
`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` của `express-rate-limit`). Phát hiện
thêm lúc sửa: dòng đó **không** tự động sửa `socket.handshake.address` (dùng
cho quota `MAX_ROOMS_PER_IP`) — engine.io đọc thẳng
`req.connection.remoteAddress`, hoàn toàn tách biệt khỏi cấu hình `trust
proxy` của Express, nên phải thêm riêng `getClientIp()`
(`server/socket/state.js`) cùng logic loopback-only. Xem TODO.md #30,
`docs/fix-log.md`.
