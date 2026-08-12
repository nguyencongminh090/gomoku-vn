# B91 — Đăng nhập bằng Google (OAuth 2.0)

Hướng dẫn thực thi cho TODO.md #91. Yêu cầu người dùng: thêm đăng nhập Google,
tự cung cấp Client ID/Secret sau khi tạo qua Google Cloud Console (Google Auth
Platform), làm trực tiếp ("write to TODO, you will do it") thay vì chỉ ghi lại
để làm sau.

## Cách tiếp cận bắt buộc

- **Tái dùng session cookie mechanism sẵn có** (`SessionManager` +
  `session-cookie.js` + `startSession()` trong `routes/auth.js`) — KHÔNG
  dựng cơ chế xác thực song song (không JWT riêng cho OAuth, không session
  store riêng). Google chỉ là một cách MỚI để xác định `userId`/`displayName`
  đưa vào đúng `startSession()` đã có.
- **KHÔNG dùng `passport`/`passport-google-oauth20`.** Chỉ cần 1 provider
  (Google), `google-auth-library` (chính chủ Google, đã cân nhắc so với
  passport lúc thảo luận với người dùng) đủ — thêm 1 tầng trừu tượng
  passport cho đúng 1 provider là dư thừa.
- **GOOGLE_CLIENT_ID/SECRET phải OPTIONAL**, khác `JWT_SECRET` (vốn throw nếu
  thiếu ngoài `NODE_ENV=test`). Một môi trường dev/CI chưa cấu hình Google
  OAuth vẫn phải boot được — 2 route trả `503 OAUTH_NOT_CONFIGURED` thay vì
  crash server.
- **KHÔNG dùng 1 giá trị `GOOGLE_CALLBACK_URL` cố định trong `.env`.** Ban đầu
  làm vậy và nó vỡ ngay khi app được dùng qua nhiều origin cùng lúc
  (`localhost:3000` cho dev + domain tunnel thật cho sử dụng thực tế) — state
  cookie set ở origin A không tới được callback bị Google đưa về origin B cố
  định. Tính callback URL động từ `req.protocol`/`req.get('host')` của chính
  request (hàm `googleCallbackUrl(req)` trong `routes/auth.js`), dùng cho cả
  `generateAuthUrl()` lẫn `getToken()`. An toàn vẫn được đảm bảo bởi chính
  Google (chỉ redirect URI đã đăng ký trong Google Cloud Console mới được
  Google chấp nhận) — server chỉ chọn đúng giá trị để gửi, không mở rộng
  quyền. Nhớ: mỗi origin thật sự dùng (kể cả domain tunnel) phải được thêm
  riêng vào "Authorized redirect URIs" của Client trên Google Cloud Console —
  code không thay được bước đăng ký thủ công đó.
- **`CORS_ORIGIN` trong `.env` cũng phải liệt kê MỌI origin thật sự dùng**,
  cách nhau bởi dấu phẩy (`isAllowedOrigin()` trong `middleware/auth.js` hỗ
  trợ sẵn cú pháp này) — không chỉ 1 domain. Thiếu `CORS_ORIGIN` hoàn toàn thì
  socket chỉ nhận origin `localhost`/`127.0.0.1`; set nó thành đúng 1 domain
  tunnel thì lại khoá mất `localhost`. Đây là lỗi riêng, không phải OAuth,
  nhưng cùng nhóm nguyên nhân (đa origin) và cùng phát hiện trong 1 lượt debug.
- **`password_hash` giữ nguyên `NOT NULL`** trong schema — đừng nới lỏng
  constraint. Sinh 1 bcrypt hash thật (ngẫu nhiên, `crypto.randomBytes`) cho
  tài khoản OAuth thay vì cho phép NULL — ít thay đổi schema hơn, và không
  route nào khác phải học cách xử lý `password_hash IS NULL`.
- **Migration cột mới theo đúng khuôn mẫu đã có** trong `database.js`
  (`PRAGMA table_info` + `ALTER TABLE ADD COLUMN` nếu thiếu — xem
  `tournament_pairings.games`/`tournaments.cancelled_at` làm ví dụ), không
  nghĩ ra cơ chế migration mới.
- **State cookie chống CSRF là bắt buộc**, không phải tuỳ chọn — đây là
  route redirect nhận input từ bên ngoài (Google), khác các route
  POST /login|register|guest vốn chỉ nhận input từ chính client app. Scope
  cookie theo `path: '/api/auth/google'`, KHÔNG dùng `/` — không cần cookie
  này ở bất kỳ request nào khác.
- **Payload truyền từ callback sang trang landing PHẢI qua URL fragment, không
  phải query string.** Lý do kép: (1) CSP hiện tại (`server/config/csp.js`)
  là `script-src 'self'` không có `'unsafe-inline'`, nên không thể set
  `localStorage` bằng `<script>` inline ngay trong response redirect — phải
  qua 1 trang tĩnh load script riêng; (2) ngay cả với trang tĩnh đó, fragment
  (`#...`) không bao giờ gửi lên server/access log, còn query string thì có
  — dù dữ liệu ở đây không phải bí mật (theo đúng model của `session.js`:
  `userId`/`displayName`/`isGuest`/`expiresAt` vốn đã không bí mật), vẫn nên
  chọn cơ chế ít lộ hơn khi chi phí bằng 0.
- **Đừng tự động liên kết tài khoản Google với tài khoản username/password
  có cùng email.** Ngoài phạm vi yêu cầu gốc, và match theo email tiềm ẩn
  account-takeover nếu email chưa được xác minh sở hữu ở phía kia. Nếu tương
  lai cần, hỏi lại người dùng hướng xử lý trước khi làm — không tự quyết.

## Điểm dễ sai (đã tránh)

- **`requireAuth()` (`client/js/session.js`) chỉ tin `localStorage.gvn_user`,
  KHÔNG tin cookie** (cookie là HttpOnly, JS không đọc được) — y hệt cái bẫy
  đã ghi trong CLAUDE.md phần Playwright/e2e ("authenticated pages need the
  real login UI flow, not just an API cookie"). Redirect thẳng
  `GET /api/auth/google/callback` → `index.html` mà không set
  `gvn_user` trước sẽ bị bounce ngược về `login.html` dù cookie hợp lệ. Đây
  là lý do bắt buộc phải có `oauth-complete.html` làm bước trung gian.
- **Đừng quên bump `?v=N` cache-busting** khi thêm `oauth-complete.js` +
  sửa `login.js`/`i18n.js` — 2 file mới cũng phải theo đúng version hiện tại
  (không tự ý giữ version cũ vì "mới tạo").
- **Google Auth Platform UI (2026) đã đổi** so với "APIs & Services → OAuth
  consent screen" cũ — mục cấu hình giờ tách ra "Google Auth Platform" riêng
  (Overview/Branding/Audience/Clients/...). Không quan trọng cho code, chỉ
  ghi lại vì đã tốn 1 vòng trao đổi với người dùng để tìm đúng chỗ.

## Phạm vi KHÔNG làm (ngoài yêu cầu gốc)

- Không thêm provider OAuth khác (GitHub/Facebook/...) — chỉ Google được yêu
  cầu.
- Không tự động liên kết tài khoản theo email (xem trên).
- Không tự động hoá xác minh end-to-end qua trình duyệt thật với tài khoản
  Google thật — việc này do người dùng tự làm (đã xác minh xong qua cả
  `localhost:3000` lẫn domain tunnel, xem TODO.md #91).

Xem tóm tắt triển khai + kết quả test: [docs/todo/B91-google-oauth-login.md](../todo/B91-google-oauth-login.md).
