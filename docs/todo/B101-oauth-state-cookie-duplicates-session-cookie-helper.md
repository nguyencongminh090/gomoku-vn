# #101 — Cookie state OAuth tự viết tay flags thay vì tái dùng `session-cookie.js`

**Trạng thái:** chưa làm

Phát hiện qua `/code-review` (8 agent song song) trên nhánh `feature/oauth-login` trước khi merge
vào `dev`, theo yêu cầu người dùng "Review OAuth feature safe to merge to dev" (2026-08-10).

## Vấn đề

`server/utils/session-cookie.js`'s `baseCookieOptions(req)` (dòng 41-49) gom sẵn
`httpOnly`/`sameSite`/`secure`/`path` cho cookie phiên, đúng mục đích tránh việc thuộc tính cookie
lệch nhau giữa các nơi set/clear (comment đầu file: "Split across call sites, the set and clear paths
drift"). `clearSessionCookie()` (dòng 68-70) luôn dùng LẠI đúng `baseCookieOptions(req)` khi clear, vì
nếu Path/SameSite lúc clear khác lúc set thì trình duyệt âm thầm không xoá được cookie.

Cookie state OAuth (`gvn_oauth_state`) không tái dùng hàm này:

- Set (`server/routes/auth.js:435-441`): `{ httpOnly: true, sameSite: 'lax', secure: isSecureRequest(req),
  path: OAUTH_STATE_COOKIE_PATH, maxAge: ... }` — viết tay lại đúng các flag `baseCookieOptions()` đã
  có, chỉ tái dùng `isSecureRequest` (import riêng) chứ không tái dùng cả bundle.
- Clear (dòng 471): `res.clearCookie(OAUTH_STATE_COOKIE, { path: OAUTH_STATE_COOKIE_PATH })` — chỉ
  truyền `path`, thiếu `sameSite`/`httpOnly`/`secure` mà `clearSessionCookie()` luôn truyền đủ.

## Hậu quả

- Rủi ro drift: nếu sau này đổi chính sách cookie chung (vd. `sameSite: 'lax'` → `'strict'`, thêm
  `partitioned`) trong `baseCookieOptions()`, cookie state OAuth sẽ không tự động theo vì không đọc
  hàm đó — vẫn dùng flag cũ đã hardcode.
- Rủi ro clear không khớp set (đúng lớp lỗi `session-cookie.js`'s comment cảnh báo): nếu thuộc tính
  lúc set và lúc clear của `gvn_oauth_state` từng lệch nhau thật, trình duyệt có thể không xoá được
  cookie này, để sót lại `gvn_oauth_state` cũ.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Mức độ:** thấp — hiện tại flag set/clear đang khớp nhau bằng tay (`path` cùng giá trị,
  `sameSite`/`httpOnly` cùng ngầm định `'lax'`/`true` ở cả 2 nơi), chưa có sự cố thật; rủi ro nằm ở
  tương lai khi 1 trong 2 nơi bị sửa mà quên sửa nơi kia.
- **Fix dự kiến khi làm:** cho `baseCookieOptions(req)` nhận thêm tham số `path` (mặc định `'/'` như
  hiện tại) thay vì hardcode, rồi cookie state OAuth gọi `baseCookieOptions(req, { path:
  OAUTH_STATE_COOKIE_PATH })` cho cả set và clear — 1 nguồn sự thật duy nhất cho flag cookie trong
  toàn bộ file `auth.js`.

Chi tiết hướng làm: [docs/instruction/B101-oauth-state-cookie-duplicates-session-cookie-helper.md](../instruction/B101-oauth-state-cookie-duplicates-session-cookie-helper.md).
