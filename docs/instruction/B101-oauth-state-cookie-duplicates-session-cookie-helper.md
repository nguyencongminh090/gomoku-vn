# B101 — Cookie state OAuth tự viết tay flags thay vì tái dùng `session-cookie.js`

Hướng dẫn thực thi cho TODO.md #101 (chưa làm — chỉ ghi lại khi phát hiện qua `/code-review`).

## Cách tiếp cận khi làm

- **Cho `baseCookieOptions(req)` (`server/utils/session-cookie.js:41-49`) nhận thêm 1 tham số `path`
  tuỳ chọn** (mặc định `'/'` như hiện tại) thay vì hardcode — thay đổi tối thiểu, không ảnh hưởng
  bất kỳ call site nào hiện có (session cookie chính vẫn dùng `path: '/'` mặc định).
- **`server/routes/auth.js`'s set/clear cho `gvn_oauth_state`** gọi lại
  `baseCookieOptions(req, OAUTH_STATE_COOKIE_PATH)` (hoặc dạng object option tương đương) cho CẢ set
  lẫn clear — đảm bảo 2 nơi luôn dùng đúng 1 nguồn, tự động đồng bộ nếu `baseCookieOptions()` đổi
  sau này.
- **Giữ `maxAge` riêng cho cookie state** (không có trong `baseCookieOptions`, TTL ngắn hơn session
  cookie) — chỉ hợp nhất phần flag chung (`httpOnly`/`sameSite`/`secure`/`path`), không gộp toàn bộ
  logic 2 loại cookie làm một vì mục đích khác nhau (session dài hạn vs CSRF-state ngắn hạn).

## Phạm vi KHÔNG làm

- Không đổi `sameSite`/`httpOnly`/`secure` hiện tại — chỉ đổi CÁCH viết (tái dùng hàm chung), không
  đổi GIÁ TRỊ đang dùng.
- Không gộp `gvn_oauth_state` và session cookie thành 1 cookie — 2 cookie có mục đích và vòng đời khác
  nhau, giữ tách biệt.

Xem báo cáo gốc: [docs/todo/B101-oauth-state-cookie-duplicates-session-cookie-helper.md](../todo/B101-oauth-state-cookie-duplicates-session-cookie-helper.md).
