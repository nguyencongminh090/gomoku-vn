# B119 — Guest bấm "Create account" không vào được form đăng ký

Hướng dẫn thực thi cho TODO.md #119 (chưa làm — chỉ ghi lại khi phát hiện, người dùng chọn file
trước thay vì fix ngay, 2026-08-14).

## Cách tiếp cận khi làm

- **Sửa đúng lớp gốc**: `client/js/login.js:22-48`, `checkExistingSession()`. KHÔNG sửa
  `client/js/settings-panel.js`'s nút "Create account" (`<a href="login.html">`, dòng 274-278) —
  nút đó đã đúng, vấn đề là `login.html` tự bounce guest đi trước khi họ kịp thấy gì.
- Thêm điều kiện: chỉ auto-redirect về `index.html` khi có session thật (`!isGuest`), không redirect
  khi session hiện tại là guest. Lấy `isGuest` qua `window.GvnSession.getUser()` (đã có field
  `isGuest` — xem `session.js:184-195` `applyServerIdentity()` và `settings-panel.js:256` đã dùng
  đúng field này để hiện badge "Khách").
- **Không đổi hành vi của session thật** (non-guest) — user thật bấm vào `login.html` khi đã đăng
  nhập vẫn phải bị bounce về `index.html` như cũ (đây là hành vi mong muốn, tránh flash form đăng
  nhập cho người đã đăng nhập).
- **Không tự ý log out guest session hiện tại** khi họ vào được `login.html` — nếu guest đang ở
  trong phòng rồi quay lại (đóng tab đăng ký, back), họ vẫn phải giữ nguyên session guest & phòng
  đang chơi. Việc "chuyển" từ guest sang tài khoản thật chỉ nên xảy ra khi submit form
  đăng ký/đăng nhập thành công — `onAuthSuccess()` (`login.js:213-215`) gọi
  `GvnSession.completeLogin()` đã tự ghi đè session cũ bằng session mới, không cần thêm logic logout
  thủ công.
- Giữ nguyên 2 exception hiện có trong `checkExistingSession()` (kicked-notice, oauth error) — chỉ
  thêm điều kiện guest vào cùng chỗ, không viết lại toàn bộ IIFE.
- Kiểm tra lại `requireAuth()` (`session.js:127-131`) và mọi nơi khác gọi `hasBelievedSession()`
  (`socket-client.js`, `session.js`) xem có chỗ nào khác cũng cần phân biệt guest/non-guest theo
  cùng logic — tránh sửa nửa vời chỉ ở `login.js` rồi phát sinh bug tương tự ở chỗ khác dùng chung
  hàm này.

## Phạm vi KHÔNG làm

- Không đổi cấu trúc/API của `GvnSession` (`session.js`) — chỉ đọc thêm field `isGuest` đã có sẵn
  trên object trả về từ `getUser()`.
- Không đổi nút "Create account" trong `settings-panel.js` — nó đã đúng hành vi (`href="login.html"`,
  full-page navigation, không phải SPA route).
- Không đụng luồng OAuth (`oauth-complete.js`, `/api/auth/google*`) — không liên quan tới báo cáo
  này.

## Viết test

Không có Jest cho `client/js/`. Verify bằng browser thật khi sửa (theo `playwright-e2e-safety` nếu
viết Playwright script, hoặc `run` skill thủ công):
1. Vào phòng làm guest → mở Settings → bấm "Create account" → phải thấy form đăng ký ở lại trên
   `login.html`, không bị bounce.
2. Đăng nhập tài khoản thật → thử điều hướng thẳng tới `login.html` → vẫn phải bị bounce về
   `index.html` như cũ (regression check cho hành vi non-guest).
3. Guest bấm Create account, không submit gì, back lại phòng cũ → vẫn còn trong phòng (session
   guest không bị xoá chỉ vì ghé qua `login.html`).

Xem thêm: [docs/todo/B119-guest-khong-tao-duoc-tai-khoan-tu-nut-create-account.md](../todo/B119-guest-khong-tao-duoc-tai-khoan-tu-nut-create-account.md).
