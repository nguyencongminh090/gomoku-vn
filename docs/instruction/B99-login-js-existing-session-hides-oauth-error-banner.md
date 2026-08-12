# B99 — `login.js` chuyển hướng session có sẵn trước khi kịp hiện banner lỗi OAuth

Hướng dẫn thực thi cho TODO.md #99 (chưa làm — chỉ ghi lại khi phát hiện qua `/code-review`).

## Cách tiếp cận khi làm

- **Đọc `location.search` cho `error=` TRƯỚC khi gọi `checkExistingSession()`'s redirect** trong
  `client/js/login.js` — nếu có `error=oauth_state`/`oauth_failed`/`oauth_not_configured` (xem #98),
  ưu tiên hiện banner lỗi, KHÔNG tự động `location.replace('index.html')` ngay — có thể vẫn cho phép
  người dùng tự bấm 1 link/nút "Về trang chủ" sau khi đọc banner.
- **Không phá vỡ hành vi hiện có cho trường hợp không có lỗi** — người dùng đã đăng nhập, không có
  `error=` trong URL, vẫn phải tự động redirect về `index.html` như cũ (đây là hành vi mong muốn, chỉ
  case có lỗi mới cần giữ lại ở `login.html`).
- **Viết test đơn giản** (nếu có hạ tầng test client-side — hiện `client/js/` chưa có, xem rule
  "Bug-fix workflow" trong `CLAUDE.md`) hoặc xác minh thủ công qua trình duyệt: set
  `localStorage.gvn_user` giả, mở `login.html?error=oauth_state`, xác nhận banner lỗi hiện được thay
  vì bị bounce ngay.

## Phạm vi KHÔNG làm

- Không đổi `hasBelievedSession()`/`checkExistingSession()`'s logic đọc session — chỉ đổi THỨ TỰ kiểm
  tra trong `login.js`.
- Không đổi hành vi cho người dùng chưa đăng nhập (case phổ biến nhất, đã hoạt động đúng).

Xem báo cáo gốc: [docs/todo/B99-login-js-existing-session-hides-oauth-error-banner.md](../todo/B99-login-js-existing-session-hides-oauth-error-banner.md).
