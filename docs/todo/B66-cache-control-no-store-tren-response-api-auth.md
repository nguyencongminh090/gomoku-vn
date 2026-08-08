# Phần B #66. Thiếu `Cache-Control: no-store` trên response `/api/auth/*` — JWT có thể bị cache

**Nguồn:** báo cáo `network_security_audit.md` (Antigravity IDE, 2026-08-08) — "Check security: Which
info can be leak through Networks in Developer Tools?"

## Vấn đề đã xác nhận

`POST /api/auth/login`, `/register`, `/guest` trả JWT token trong response body nhưng không set
`Cache-Control` — mặc định Express/Helmet không thêm header này. Trên đường truyền có proxy/cache
trung gian (kể cả browser bfcache/back-forward hoặc shared proxy sai cấu hình), response chứa token
có nguy cơ bị lưu lại ngoài ý muốn.

**Đối chiếu với hiện trạng:** `server/index.js` dùng `helmet()` mặc định (không override
`hsts`/cache) — Helmet không tự thêm `Cache-Control` cho response API, phần này đúng như audit nêu.

## Việc cần làm

- Thêm middleware/`res.set('Cache-Control', 'no-store')` cho `server/routes/auth.js` (`/login`,
  `/register`, `/guest`) — không cache response chứa token.
- Cân nhắc áp dụng chung cho toàn bộ `/api/*` nếu không có endpoint nào cố tình cần cache (kiểm tra
  `server/routes/games.js` có muốn cache `GET /api/games*` không trước khi áp rule chung — nếu có,
  chỉ giới hạn ở `auth.js`).
- Thêm test trong `server/tests/` xác nhận header có mặt trên response login/register/guest.

## Ngoài phạm vi

- Không đổi cơ chế lưu token (`localStorage`) — xem [[B68]] cho việc đó.

## Trạng thái

✅ ĐÃ XONG.

- Thêm middleware `router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); })`
  ngay sau `authLimiter` trong `server/routes/auth.js` — áp cho cả 3 route (`/register`, `/login`,
  `/guest`), cả nhánh thành công lẫn lỗi (middleware chạy trước handler nên set header trước khi bất
  kỳ response nào được gửi). Không đổi Helmet global config, không đụng `games.js` — đúng theo
  `instruction.md`.
- Test mới: `server/tests/auth-cache-control.test.js` — dựng server thật (theo pattern của
  `auth-error-codes.test.js`), gọi qua `fetch`, assert header `cache-control: no-store` trên response
  thật của 5 case: register thành công, register lỗi (400), login thành công, login lỗi (401), guest.
  Toàn bộ 855 test hiện có (`npm test`) vẫn pass.
