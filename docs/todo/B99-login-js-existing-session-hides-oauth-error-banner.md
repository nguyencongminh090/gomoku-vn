# #99 — `login.js` chuyển hướng session có sẵn trước khi kịp hiện banner lỗi OAuth

**Trạng thái:** chưa làm

Phát hiện qua `/code-review` (8 agent song song) trên nhánh `feature/oauth-login` trước khi merge
vào `dev`, theo yêu cầu người dùng "Review OAuth feature safe to merge to dev" (2026-08-10).

## Vấn đề

`client/js/login.js`'s `checkExistingSession()` (IIFE đầu file, dòng 22-36) chạy và gọi
`window.GvnSession.hasBelievedSession()` (`client/js/session.js:96-98`, chỉ đọc `localStorage.gvn_user`
hoặc JWT cũ) **trước** đoạn code đọc query param `error=oauth_failed`/`oauth_state` và hiện banner lỗi
(dòng 57-64).

Nếu người dùng ĐÃ có phiên đăng nhập từ trước (khách, username/password, hoặc Google từ lần trước) rồi
thử đăng nhập Google lần nữa (vd. test tài khoản thứ 2) và lần callback đó thất bại (state mismatch
hoặc lỗi verify), trình duyệt tới `login.html?error=oauth_state`. Nhưng `checkExistingSession()` đã
gọi `location.replace('index.html')` ngay từ đầu — trang bị điều hướng đi gần như lập tức, đoạn code
hiện banner lỗi tuy vẫn chạy đồng bộ nhưng không kịp hiển thị cho người dùng thấy trước khi trang unload.

## Hậu quả

- Người dùng đã đăng nhập thử Google lần 2 bị lỗi sẽ chỉ thấy mình "bị bounce" về trang chủ, không
  biết lần thử Google vừa rồi thất bại vì sao — không mất phiên hiện tại (vẫn đăng nhập bình thường),
  chỉ là mất thông báo lỗi.
- Không ảnh hưởng người dùng CHƯA đăng nhập (trường hợp phổ biến nhất khi dùng OAuth) — `hasBelievedSession()`
  trả `false`, banner lỗi hiện bình thường.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Mức độ:** thấp — chỉ ảnh hưởng người dùng đã đăng nhập thử liên kết/đổi tài khoản Google, không
  có báo cáo người dùng cụ thể.
- **Fix dự kiến khi làm:** kiểm tra query param `error=` TRƯỚC khi gọi `checkExistingSession()`'s
  redirect — nếu có `error=oauth_*`, ưu tiên hiện banner lỗi (có thể vẫn giữ nút/link quay lại
  `index.html` cho người dùng tự bấm) thay vì tự động điều hướng ngay lập tức.

Chi tiết hướng làm: [docs/instruction/B99-login-js-existing-session-hides-oauth-error-banner.md](../instruction/B99-login-js-existing-session-hides-oauth-error-banner.md).
