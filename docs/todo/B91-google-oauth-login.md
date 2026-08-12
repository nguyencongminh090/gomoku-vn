# #91 — Đăng nhập bằng Google (OAuth 2.0)

**Trạng thái:** ✅ ĐÃ XONG — đã xác minh thủ công qua trình duyệt thật với tài khoản Google thật (2026-08-09)

Thêm luồng "Đăng nhập với Google" bên cạnh username/password và guest hiện có,
tái dùng nguyên vẹn cơ chế session server-side (cookie HttpOnly, `SessionManager`)
— không phát sinh cơ chế xác thực song song nào. `users` có thêm 2 cột
`oauth_provider`/`oauth_id` (migration cộng thêm, không đụng dữ liệu cũ).
2 route mới: `GET /api/auth/google` (redirect sang Google) và
`GET /api/auth/google/callback` (đổi code lấy profile, tìm/tạo user, mở
session, redirect về trang landing `oauth-complete.html` truyền profile qua
URL fragment — không phải query string — để không lộ ra network/access log).
Nút "Đăng nhập với Google" mới trên `login.html`. `npm test`: 994/994 pass
(+14 test case trong `auth-google-oauth.test.js`, mock toàn bộ
`google-auth-library`).

**Follow-up cùng ngày (2026-08-09):** callback URL ban đầu đọc từ 1 giá trị
`GOOGLE_CALLBACK_URL` cố định trong `.env` — vỡ ngay khi người dùng dùng app
qua CẢ `localhost:3000` LẪN domain tunnel (`play3cr.dpdns.org`) cùng lúc, vì
state cookie set ở origin này không tới được callback ở origin kia. Sửa:
`server/routes/auth.js` giờ tính callback URL từ chính `Host`/protocol của
mỗi request (`googleCallbackUrl(req)`), bỏ hẳn `GOOGLE_CALLBACK_URL` khỏi
`config.js`/`.env`. Xem mục "Đa origin" bên dưới.

## Yêu cầu gốc (người dùng, 2026-08-09)

> Cách để thêm OAuth? Có free không? Setup thế nào?
> [...]
> Okay, write to TODO, You will do it

Trao đổi trong hội thoại: người dùng tự tạo Google Cloud project (`GomokuWeb`)
và OAuth Client ID qua Google Auth Platform (UI 2026 — không còn ở
"APIs & Services → OAuth consent screen" cũ mà ở mục riêng "Google Auth
Platform"), cung cấp Client ID/Secret — đã lưu vào `.env` của worktree
`gomoku-vn-oauth-login` (branch `feature/oauth-login`, tách biệt khỏi checkout
chính theo yêu cầu người dùng). Toàn bộ phần code hoá (routes, DB, client) làm
trực tiếp theo yêu cầu "you will do it", không qua giai đoạn `features/`
thảo luận riêng vì phạm vi đã rõ qua trao đổi trực tiếp.

## Phạm vi đã làm

- **Schema** (`server/db/schema.sql` + migration cộng thêm trong
  `database.js`, cùng khuôn mẫu với `tournament_pairings.games`/
  `tournaments.cancelled_at`): `users.oauth_provider`, `users.oauth_id`
  (nullable), index `(oauth_provider, oauth_id)`. `password_hash` giữ nguyên
  `NOT NULL` — tài khoản OAuth vẫn có 1 bcrypt hash thật (ngẫu nhiên, không
  ai biết) thay vì nới lỏng constraint, vì hash đó không bao giờ được so
  sánh tới (chỉ đăng nhập được qua Google).
- **`server/db/database.js`**: `createUser()` nhận thêm `oauthProvider`/
  `oauthId` (optional, mặc định `null` — không đổi chữ ký cho caller cũ),
  hàm mới `getUserByOAuthId(provider, oauthId)`.
- **`server/routes/auth.js`**:
  - `GET /api/auth/google` — redirect sang Google consent screen, kèm
    cookie `gvn_oauth_state` (HttpOnly, 5 phút, scope path
    `/api/auth/google`) chống CSRF trên chính luồng OAuth.
  - `GET /api/auth/google/callback` — xác minh `state` khớp cookie trước
    khi chạm DB/gọi Google; đổi `code` lấy token, verify ID token qua
    `google-auth-library`; tìm user theo `(google, sub)`, tạo mới nếu chưa
    có (username sinh tự động + hậu tố hex ngẫu nhiên, display name lấy từ
    profile Google hoặc fallback tên khách nếu không hợp lệ); mở session
    qua đúng `startSession()`/`sessionManager` đã có; redirect về
    `/oauth-complete.html#<user JSON đã encode>`.
  - Cả 2 route đều `503 OAUTH_NOT_CONFIGURED` nếu thiếu biến môi trường
    (không throw lúc khởi động server, khác `JWT_SECRET`) — môi trường
    chưa cấu hình Google vẫn boot bình thường.
- **`client/oauth-complete.html` + `client/js/oauth-complete.js`** (mới):
  trang landing tối giản, đọc `location.hash`, gọi
  `GvnSession.setUser()` giống hệt `onAuthSuccess()` của `login.js`, rồi
  chuyển tới `index.html`. Bắt buộc phải qua trang riêng này (không thể
  set `localStorage` bằng `<script>` inline ngay trong response redirect)
  vì CSP hiện tại (`server/config/csp.js`) là `script-src 'self'`, không
  có `'unsafe-inline'`.
- **`client/login.html`**: thêm nút "Đăng nhập với Google" (thẻ `<a>` điều
  hướng thẳng, không qua JS — bắt buộc phải full-page navigation để hiện
  được consent screen của Google) + icon Google 4 màu chính chủ.
- **`client/js/login.js`**: đọc `?error=oauth_state`/`?error=oauth_failed`
  trên URL khi callback thất bại, hiện alert rồi dọn URL bằng
  `history.replaceState` — theo đúng khuôn mẫu `gvn_kicked_notice` đã có.
- **`client/js/i18n.js`**: thêm khoá `login.btn_google`, `login.err_oauth_fail`
  (vi + en).
- **Cache-busting**: bump `?v=96` → `?v=97` toàn bộ `client/*.html` +
  `client/js/*.js` (trừ 2 file `*-mockup.html`), theo đúng quy tắc
  CLAUDE.md — đã verify bằng `grep -rn "?v=" client/*.html client/js/*.js
  | grep -v mockup` chỉ còn đúng 1 giá trị `?v=97`.

## Đánh giá hiệu quả / an toàn

- **Hiệu quả:** cao — thêm hẳn 1 phương thức đăng nhập mới người dùng yêu
  cầu, không phá vỡ 3 luồng cũ (register/login/guest) — tất cả test cũ vẫn
  992/992 pass.
- **An toàn:**
  - State cookie chống CSRF trên redirect OAuth (mẫu hình chuẩn, không phải
    tự nghĩ ra) — tách biệt hoàn toàn khỏi session cookie thật.
  - Payload trao đổi giữa callback → `oauth-complete.html` đi qua URL
    FRAGMENT (không phải query) — không lọt vào access log/Referer, và chỉ
    chứa các field vốn đã "không bí mật" theo đúng model của
    `session.js` (userId/displayName/isGuest/expiresAt — những gì người
    chơi khác trong phòng vốn đã thấy được).
  - `email_verified` bắt buộc `true` mới cho tạo/đăng nhập tài khoản — chặn
    trường hợp Google trả về 1 email chưa xác minh.
  - Không đổi bất kỳ route/luồng auth cũ nào (register/login/guest/logout/
    upgrade-session) — thuần cộng thêm.
- **Giới hạn đã biết, cố ý không làm:** không tự động **liên kết** một tài
  khoản Google với tài khoản username/password đã có cùng email — mỗi lần
  đăng nhập Google tạo/tìm theo `oauth_id`, không match theo email. Lý do:
  match theo email tiềm ẩn account-takeover nếu email chưa từng được xác
  minh sở hữu ở phía username/password (ngoài phạm vi yêu cầu gốc, chưa có
  chỉ đạo rõ từ người dùng) — nếu cần, nên hỏi lại hướng xử lý trước khi
  làm, không tự quyết.

## Đa origin: callback URL tính động theo request, không cố định (follow-up 2026-08-09)

Sau lần xác minh thủ công đầu tiên (chỉ test qua `localhost:3000`), người
dùng thử lại qua domain thật `https://play3cr.dpdns.org` (Cloudflare Tunnel
trỏ tạm về dev server này) và đăng nhập Google thất bại lần nữa — cùng lỗi
`missing/mismatched state`, nhưng lần này vì lý do khác: `GOOGLE_CALLBACK_URL`
cố định `http://localhost:3000/...` không khớp origin thật đang dùng.

Sửa tận gốc thay vì chỉ đổi giá trị `.env`: 1 giá trị cố định về bản chất
không thể đúng cho nhiều origin cùng lúc. `server/routes/auth.js` thêm hàm
`googleCallbackUrl(req)` tính callback URL từ `req.protocol`/`req.get('host')`
của chính request đó (đã đúng đằng sau Cloudflare Tunnel nhờ `trust proxy:
'loopback'` có sẵn ở `index.js`) — dùng cho cả `generateAuthUrl()` (bước
`/google`) lẫn `getToken()` (bước `/callback`). `GOOGLE_CALLBACK_URL` bỏ hẳn
khỏi `config.js`/export/`.env` — không còn cần thiết. An toàn: origin nào
Google thực sự chấp nhận vẫn do chính Google Cloud Console quyết định (danh
sách "Authorized redirect URIs" của Client) — code này chỉ chọn ĐÚNG giá trị
để gửi cho Google, không mở rộng những gì Google cho phép.

Đồng thời phát hiện + sửa 1 vấn đề riêng qua log: CSWSH origin check
(`server/middleware/auth.js`'s `isAllowedOrigin`) từ chối
`https://play3cr.dpdns.org` cho socket handshake vì `.env` của worktree này
thiếu `CORS_ORIGIN` — không set thì chỉ chấp nhận `localhost`/`127.0.0.1`.
Đã thêm `CORS_ORIGIN=https://play3cr.dpdns.org,http://localhost:3000` (dạng
danh sách phân tách bởi dấu phẩy, cú pháp có sẵn của hàm này) vào `.env` để
cả 2 origin cùng dùng được — không phải thay đổi code, chỉ là cấu hình.

## Trạng thái unit test

`server/tests/auth-google-oauth.test.js` (14 test case, mock toàn bộ
`google-auth-library` + `../db/database`): 2 describe block —
"không cấu hình" (503 cho cả 2 route, không đụng DB) và "đã cấu hình" (redirect
kèm state cookie đúng thuộc tính, state mismatch/thiếu code → lỗi không đụng
Google API, tạo tài khoản mới đúng field, fallback display name khi profile
thiếu tên, user cũ (`oauth_id` đã có) không tạo trùng, email chưa verify bị
từ chối, lỗi mạng/Google API redirect về lỗi thay vì throw 500,
`generateOAuthUsername` thử lại đúng khi candidate đầu bị trùng, và **2 test
mới** xác nhận `redirect_uri` tính đúng theo `Host` header giả lập
`play3cr.dpdns.org` thay vì theo 1 giá trị cố định — dùng `http.request` thô
vì `fetch()` chặn ghi đè header `Host`). `npm test` toàn bộ repo: 994/994
pass, không có test nào bị vỡ.

## Xác minh thủ công qua trình duyệt thật (2026-08-09)

Việc này không thể tự động hoá an toàn bằng Playwright (click qua consent
screen thật của Google đụng tới xác thực bên thứ ba/tài khoản thật, có thể
vướng 2FA) nên người dùng tự bấm thử trực tiếp trên `login.html`.

Lần thử đầu tiên **thất bại có chủ đích** (đúng như thiết kế, không phải bug):
người dùng bấm nút trong khi trình duyệt đang ở `https://play3cr.dpdns.org`
(Cloudflare Tunnel của họ đang trỏ tạm về đúng dev server này) — log server ghi
`[Auth] Google OAuth callback: missing/mismatched state`. Nguyên nhân: bước
`GET /api/auth/google` chạy qua tunnel nên cookie `gvn_oauth_state` bị gắn vào
domain `play3cr.dpdns.org`, còn `GOOGLE_CALLBACK_URL` trong `.env` lại cố định
`http://localhost:3000/...` — Google đưa trình duyệt quay lại thẳng
`localhost:3000` (bỏ qua tunnel), khác origin với nơi cookie state được set,
nên trình duyệt không gửi lại cookie đó → state check (đúng chức năng chống
CSRF) từ chối hợp lệ. Sau khi thử lại bằng cách gõ thẳng
`http://localhost:3000/login.html` (cùng origin với `GOOGLE_CALLBACK_URL`),
luồng chạy đúng — người dùng xác nhận "work".

Chi tiết đầy đủ: [docs/instruction/B91-google-oauth-login.md](../instruction/B91-google-oauth-login.md).
