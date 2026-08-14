# #119 — Guest bấm "Create account" trong Settings không vào được form đăng ký

**Trạng thái:** ✅ Đã sửa.

## Nguồn

Báo cáo người dùng kèm ảnh chụp modal Settings (guest "FreeCrow") — "guest user report they cannot
create account by click Create Account in Settings. He must log out and create account outside."
(2026-08-14).

## Mô tả

Trong panel Settings toàn cục (`client/js/settings-panel.js`), khi tài khoản hiện tại là guest, nút
**"Create account"** render ra là `<a href="login.html">` (dòng 274-278). Bấm vào nút này điều hướng
sang `login.html`, nhưng người dùng bị bật ngược lại `index.html` ngay lập tức — không bao giờ thấy
được form đăng ký. Chỉ khi **Log out** trước (xoá session) thì vào `login.html` mới ở lại được.

## Nguyên nhân gốc

`client/js/login.js:22-48` (trước khi sửa), IIFE `checkExistingSession()`:

```js
const hasOAuthError = new URLSearchParams(window.location.search).has('error');
if (window.GvnSession.hasBelievedSession() && !sessionStorage.getItem('gvn_kicked_notice') && !hasOAuthError) {
  window.location.replace('index.html');
}
```

`hasBelievedSession()` (`client/js/session.js:112-114`) chỉ trả về `!!(getUser() || legacyToken())`
— không phân biệt session guest với session thật. Một guest luôn có `getUser()` khác null, nên điều
kiện này luôn đúng với guest → `login.html` tự bounce về `index.html` trước khi form đăng ký kịp
render, bất kể người dùng bấm vào từ đâu.

Nút `<a href="login.html">` trong `settings-panel.js` đã đúng — lớp thật sự cần sửa là guard
`checkExistingSession()` trong `login.js`.

## Sửa đã áp dụng (2026-08-14, `fix/guest-create-account-bounce` off `main`)

`client/js/login.js:22-53` — đọc thêm `GvnSession.getUser()` và bỏ qua bounce khi session hiện tại
là guest:

```js
const cachedUser = window.GvnSession.getUser();
const isGuestSession = !!(cachedUser && cachedUser.isGuest);
if (window.GvnSession.hasBelievedSession() && !isGuestSession && !sessionStorage.getItem('gvn_kicked_notice') && !hasOAuthError) {
  window.location.replace('index.html');
}
```

Session thật (`isGuest: false`) vẫn bị bounce như cũ — hành vi mong muốn, tránh flash form đăng
nhập cho người đã đăng nhập. Không log out guest session hiện tại — `checkExistingSession()` chỉ
quyết định có redirect hay không, không đụng session; guest chỉ thật sự chuyển sang tài khoản mới
khi `onAuthSuccess()` (`login.js`) → `GvnSession.completeLogin()` chạy sau khi submit thành công.

**Đã kiểm tra các nơi khác gọi `hasBelievedSession()`** (`socket-client.js:39` và
`session.js:127-128`, cả hai đều là page-guard cho trang cần đăng nhập — bounce KHỎI trang khi
**không** có session) — không cần sửa, vì hướng ngược lại: guest vẫn hợp lệ ở những trang đó (guest
được phép dùng `index.html`/`room.html`), nên logic hiện tại đã đúng cho cả 2 nơi này.

## Đánh giá hiệu quả / an toàn

**Mức độ rủi ro thấp:** chỉ thêm 1 điều kiện đọc field `isGuest` đã có sẵn trên object trả về từ
`GvnSession.getUser()` (dùng ở nhiều nơi khác, ví dụ `settings-panel.js:256,264,273`) — không đổi
cấu trúc `GvnSession`, không đụng luồng OAuth, không đổi nút "Create account" trong
`settings-panel.js`.

## Trạng thái unit test

`client/tests/login-oauth-error-banner.test.js` (đã có sẵn cho TODO.md #99, mở rộng cho #119) —
thêm mock `GvnSession.getUser()`, describe block mới `'login.js does not bounce a guest session
(TODO.md #119)'` (3 test case): guest session không bị redirect; non-guest vẫn bị redirect như cũ
(regression); guest + `error=oauth_state` vẫn không redirect và vẫn hiện banner lỗi OAuth.

`npm test`: 1139/1139 pass (8/8 trong suite `login-oauth-error-banner.test.js`, gồm 3 test mới).

Xem thêm: [docs/instruction/B119-guest-khong-tao-duoc-tai-khoan-tu-nut-create-account.md](../instruction/B119-guest-khong-tao-duoc-tai-khoan-tu-nut-create-account.md).
