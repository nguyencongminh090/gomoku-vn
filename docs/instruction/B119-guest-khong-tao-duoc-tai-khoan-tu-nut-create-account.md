# B119 — Guest bấm "Create account" không vào được form đăng ký

Hướng dẫn thực thi cho TODO.md #119 (đã làm — `fix/guest-create-account-bounce` off `main`,
2026-08-14).

## Cách đã làm

- Sửa đúng lớp gốc: `client/js/login.js:22-53`, `checkExistingSession()`. KHÔNG sửa
  `client/js/settings-panel.js`'s nút "Create account" (`<a href="login.html">`) — nút đó đã đúng.
- Thêm điều kiện: chỉ auto-redirect về `index.html` khi có session thật (`!isGuest`), không redirect
  khi session hiện tại là guest. Lấy `isGuest` qua `window.GvnSession.getUser()` (field đã có sẵn —
  xem `session.js:184-195` `applyServerIdentity()` và `settings-panel.js:256` đã dùng đúng field
  này để hiện badge "Khách").
- Không đổi hành vi của session thật (non-guest) — vẫn bị bounce về `index.html` như cũ.
- Không tự ý log out guest session hiện tại khi họ vào được `login.html` — `onAuthSuccess()`
  (`login.js:213-215`) gọi `GvnSession.completeLogin()` đã tự ghi đè session cũ bằng session mới khi
  submit thành công, không cần thêm logic logout thủ công.
- Giữ nguyên 2 exception hiện có trong `checkExistingSession()` (kicked-notice, oauth error) — chỉ
  thêm điều kiện guest vào cùng chỗ.
- Đã kiểm tra `requireAuth()` (`session.js:127-131`) và `socket-client.js:39` — cả hai cũng gọi
  `hasBelievedSession()` nhưng theo hướng ngược lại (bounce KHỎI trang khi KHÔNG có session, dùng
  làm page-guard cho trang cần đăng nhập). Guest vẫn hợp lệ ở những trang đó nên không cần sửa —
  chỉ `login.js`'s bounce-VÀO cần phân biệt guest.

## Phạm vi KHÔNG làm (giữ đúng như đã lên kế hoạch)

- Không đổi cấu trúc/API của `GvnSession` (`session.js`).
- Không đổi nút "Create account" trong `settings-panel.js`.
- Không đụng luồng OAuth (`oauth-complete.js`, `/api/auth/google*`).

## Test đã viết

`client/tests/login-oauth-error-banner.test.js` (đã có sẵn cho #99) — mở rộng `setupPage()` để mock
`GvnSession.getUser()` (trả về `{ userId, displayName, isGuest }` khi có session, `null` khi không),
thêm describe block `'login.js does not bounce a guest session (TODO.md #119)'`:
1. Guest session, không có `error` param → không redirect.
2. Non-guest session, không có `error` param → vẫn redirect về `index.html` (regression check).
3. Guest session + `error=oauth_state` → không redirect, vẫn hiện banner lỗi OAuth (không phá #99).

`npm test`: 1139/1139 pass.

Xem thêm: [docs/todo/B119-guest-khong-tao-duoc-tai-khoan-tu-nut-create-account.md](../todo/B119-guest-khong-tao-duoc-tai-khoan-tu-nut-create-account.md).
