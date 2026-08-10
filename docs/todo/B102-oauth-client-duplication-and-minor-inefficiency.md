# #102 — Trùng logic "lưu user + chuyển hướng lobby" + 2 điểm kém hiệu quả nhỏ trên đường OAuth

**Trạng thái:** ✅ ĐÃ XONG (Phần 1 + 2; Phần 3 cố ý KHÔNG làm)

## Đã sửa (2026-08-10, nhánh `fix/oauth-client-duplication` → `dev`)

**Phần 1 (trùng logic):** thêm `GvnSession.completeLogin(user)` (`client/js/session.js`) — gộp
`setUser(user)` + `location.replace('index.html')`. `login.js`'s `onAuthSuccess(data)` và
`oauth-complete.js`'s nhánh thành công giờ cùng gọi hàm này thay vì viết tay riêng từng nơi.

**Phần 2 (SELECT thừa):** bỏ `db.getUserById(userId)` ngay sau `db.createUser()` ở nhánh tài khoản
Google mới (`server/routes/auth.js`) — dựng object `user` trực tiếp từ các field đã có sẵn trong scope.
Nhánh race-loser (đọc lại qua `getUserByOAuthId`) GIỮ NGUYÊN không đổi — nhánh đó thật sự cần đọc lại vì
đã thua race, giá trị trong scope không phải giá trị thật sự nằm trong DB.

**Phần 3 (bỏ `oauth-complete.html`):** KHÔNG làm — theo đúng "Phạm vi KHÔNG làm" trong hướng dẫn, đây
là phần rủi ro cao hơn 2 phần trên (đụng `index-entry.js`) và không bắt buộc làm cùng lúc; để lại cho
lần sau nếu thấy cần thiết.

Test: `client/tests/session-complete-login.test.js` (mới) — `completeLogin()` cache đúng + redirect,
kể cả trường hợp `user` falsy. `server/tests/auth-google-oauth.test.js` — 1 test mới xác nhận
`db.getUserById` không còn được gọi ở nhánh tạo tài khoản mới. Bump `?v=100`→`?v=101`.
`npm test`: 1053/1053 pass.

Phát hiện qua `/code-review` (8 agent song song) trên nhánh `feature/oauth-login` trước khi merge
vào `dev`, theo yêu cầu người dùng "Review OAuth feature safe to merge to dev" (2026-08-10).

## Vấn đề

**1. Trùng logic "lưu user rồi chuyển hướng lobby"** — `client/js/login.js:193-196`'s `onAuthSuccess(data)`:

```js
function onAuthSuccess(data) {
  if (data && data.user) window.GvnSession.setUser(data.user);
  window.location.replace('index.html');
}
```

và `client/js/oauth-complete.js:29-34` viết lại gần y hệt (khác chữ ký tham số — 1 bên nhận
`{user}`, 1 bên nhận `user` trần):

```js
if (user) {
  window.GvnSession.setUser(user);
  window.location.replace('index.html');
} else { ... }
```

Comment trong `oauth-complete.js` tự thừa nhận "This mirrors what login.js's `onAuthSuccess()` does"
— biết là trùng nhưng không gộp lại. `GvnSession` (`client/js/session.js`) đã có sẵn
`setUser`/`clearUser`/`requireAuth` nhưng chưa có bước "commit identity rồi chuyển hướng lobby" dùng
chung.

**2. `server/routes/auth.js`'s `GET /google/callback` — SELECT thừa ngay sau INSERT** khi tạo tài
khoản Google mới: gọi `db.createUser({...})` rồi dòng kế tiếp `db.getUserById(userId)` đọc lại đúng
dòng vừa insert (giá trị đã có sẵn trong scope), dù `better-sqlite3` đồng bộ và không có gì chen vào
giữa (khác với nhánh race ở #94, vốn CẦN đọc lại vì thua cuộc).

**3. `oauth-complete.html`/`oauth-complete.js` — thêm 1 vòng round-trip trang** so với luồng
username/password/khách hiện có: callback redirect tới `/oauth-complete.html#<payload>`, trang này
tải lại `session.js` + `oauth-complete.js`, gọi `setUser`, rồi LẠI `location.replace('index.html')`
lần nữa — 2 lần điều hướng + tải lại `session.js` 2 lần (1 lần ở `oauth-complete.html`, 1 lần ở
`index.html`), trong khi luồng đăng nhập thường chỉ có 1 lần điều hướng.

## Hậu quả

- (1) là rủi ro bảo trì: thay đổi tương lai cho bước "sau khi đăng nhập thành công" (vd. thêm tham số
  redirect, analytics event lần đầu đăng nhập) chỉ được sửa ở `login.js`, `oauth-complete.js` âm thầm
  giữ hành vi cũ vì không có 1 điểm gọi chung.
- (2)/(3) chỉ là chi phí hiệu năng nhỏ (1 query đồng bộ thừa, 1 lần tải trang + script thừa), không
  gây lỗi chức năng.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Mức độ:** rất thấp — thuần dọn dẹp/hiệu năng nhỏ, không có báo cáo người dùng, không ảnh hưởng
  đúng/sai của tính năng.
- **Fix dự kiến khi làm:**
  1. Thêm `GvnSession.completeLogin(user)` (gộp `setUser` + `location.replace('index.html')`) trong
     `session.js`, cho cả `login.js`'s `onAuthSuccess` và `oauth-complete.js` gọi hàm này.
  2. Bỏ `db.getUserById(userId)` thừa sau `createUser()` ở nhánh tài khoản mới — dựng `user` trực
     tiếp từ các field đã có trong scope (`{ id: userId, username, display_name: displayName,
     created_at: now, oauth_provider: 'google', oauth_id: payload.sub }`).
  3. Cân nhắc bỏ hẳn `oauth-complete.html` — redirect callback thẳng tới `/index.html#<payload>`,
     thêm đoạn kiểm tra fragment ngắn ở đầu `index-entry.js` (trước khi `requireAuth()` chạy) thay vì
     dùng trang trung gian riêng. Cần cân nhắc kỹ tác động tới cấu trúc `index-entry.js` hiện có
     trước khi đổi.

Chi tiết hướng làm: [docs/instruction/B102-oauth-client-duplication-and-minor-inefficiency.md](../instruction/B102-oauth-client-duplication-and-minor-inefficiency.md).
