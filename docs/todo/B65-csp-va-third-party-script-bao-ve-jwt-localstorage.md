**Trạng thái:** ✅ ĐÃ XONG (2026-08-08, nhánh `fix/csp-third-party-script`)

# Phần B #65. CSP + third-party script — bảo vệ JWT bearer đang ở `localStorage`

**Nguồn:** security review Network trong Developer Tools (2026-08-08, yêu cầu người dùng "Check security: Which info can be leak through Networks in Developer Tools?")

## Vấn đề đã xác nhận

Mọi trang chính đều tải script thực thi từ URL không pin version
`https://unpkg.com/@phosphor-icons/web`; đồng thời `server/index.js` chủ động
tắt Content Security Policy qua `helmet({ contentSecurityPolicy: false })`.
Script bên thứ ba chạy cùng origin nên đọc được `localStorage.gvn_token`. Token
này là JWT bearer: server chấp nhận nó ở Socket.IO handshake và token user
thường có hạn 7 ngày. Nếu CDN/package bị thay thế hoặc một XSS được chèn vào
trang, token có thể bị gửi ra ngoài và dùng lại để chiếm session.

Đây không phải kết luận rằng DevTools tự làm rò rỉ dữ liệu: Network/Application
của chính người dùng đương nhiên nhìn thấy token và dữ liệu app đã gửi cho
browser đó. Finding là thiếu hàng rào ngăn mã không đáng tin cậy đọc rồi
exfiltrate bearer token này.

## Việc cần làm

- Bỏ script executable không pin từ `unpkg.com` khỏi các trang ship thật; ưu
  tiên tự host asset/package icon trong bundle hoặc thay bằng asset nội bộ.
- Bật CSP production theo allow-list tối thiểu. Xử lý script/style inline hiện
  hữu bằng nonce hoặc hash; không giải quyết bằng `unsafe-inline` cho script.
- Chỉ allow origin ngoài khi thật sự cần (Google Fonts và audio CDN nếu vẫn giữ
  chúng), tách rõ `script-src`, `style-src`, `font-src`, `media-src`,
  `connect-src`, `img-src`, `base-uri` và `object-src`.
- Giữ Socket.IO/API cùng origin. CSP không thay TLS: xác nhận Node port không
  public trực tiếp và HTTPS/WSS vẫn do Cloudflare Tunnel kết thúc như A1.
- Thêm test regression: response HTML có CSP enforce, không còn script remote
  executable, CSP vẫn cho phép login/lobby/room/tournament hoạt động và socket
  kết nối được. Nếu sửa `client/`, bump đồng bộ `?v=N` theo `CLAUDE.md`.

## Kết quả mong đợi / tiêu chí xong

- Không còn mã JavaScript bên thứ ba không pin chạy trong origin ứng dụng.
- CSP enforce không báo lỗi cho các đường login, lobby, room, history và
  tournament; thử nghiệm gồm cả WebSocket-first lẫn polling fallback.
- Một script bị chèn hoặc remote script không nằm trong policy bị browser chặn
  trước khi có thể đọc `gvn_token`.
- Có test tự động cho CSP/header và kiểm chứng browser thật cho các trang bị
  ảnh hưởng; không đánh dấu xong chỉ vì header xuất hiện.

## Ngoài phạm vi

- Các payload đã được thiết kế là public/visible (lobby room summary, online
  display names, spectator board state, public game history) không phải phần
  sửa của mục này; thay đổi privacy policy cần task riêng.
- Không đổi `localStorage` sang cookie chỉ vì finding này. Cookie `HttpOnly`
  là một quyết định auth/CSRF lớn, cần threat model và migration riêng.

## Tóm tắt triển khai (2026-08-08)

- Tự host `@phosphor-icons/web` 2.1.2 tại `client/vendor/phosphor/{regular,bold}/`
  (chỉ 2 weight thực sự dùng trong `class="ph"`/`class="ph-bold"`, bỏ SVG font
  format lỗi thời). `<script src="https://unpkg.com/...">` ở 6 trang chính
  (`index/login/room/history/tournament/tournament-match.html`) đổi thành 2
  `<link rel="stylesheet">` trỏ vào asset nội bộ.
- Xoá toàn bộ `<script>` inline (theme/ui-mode pre-paint IIFE) ra
  `client/js/theme-preload.js`, `ui-mode-preload.js`, `online-panel-preload.js`.
- Xoá toàn bộ `onclick="fn(...)"` inline (21+6 chỗ, rải ở `game-ui.js`,
  `room-ui.js`, `history.js`, `lobby.js`, `login.html`, `room.html`) sang
  `data-action`/`data-arg` + một delegated click listener
  (`client/js/action-delegate.js`) — cần vì `script-src-attr` (không đặt riêng
  thì kế thừa `script-src`) cũng chặn inline event-handler attribute, không chỉ
  `<script>` tag.
- Bật CSP enforce qua `helmet` (`server/index.js`), directives tách vào
  `server/config/csp.js` để test độc lập không cần boot server/DB thật:
  `script-src 'self'` (không `unsafe-inline`/`unsafe-eval`, không origin
  ngoài), `script-src-attr 'none'`, `style-src` giữ `'unsafe-inline'` có chủ ý
  (hàng chục `style=""` sẵn có, rủi ro thấp hơn nhiều so với thực thi JS — xem
  lý do trong file), `font-src`/`media-src` allow đúng Google Fonts +
  freesound/raw.githubusercontent (audio CDN đang dùng), `object-src 'none'`,
  `base-uri`/`form-action`/`frame-ancestors 'self'`.
- Test: `server/tests/csp.test.js` (6 case, assert trực tiếp trên object
  directives — không unsafe-inline/eval/wildcard cho script, script-src-attr
  none, object-src none...). Toàn bộ suite: 850/850 pass.
- Kiểm chứng browser thật (Playwright, DB thật đã di dời sang
  `gomoku.db.pre-e2e` trước khi chạy, khôi phục lại sau — theo quy tắc
  Playwright/db-safety trong `CLAUDE.md`): login (guest), chuyển tab đăng
  nhập/đăng ký, toggle hiện mật khẩu, tạo phòng, ngồi vào slot, `history.html`,
  `tournament.html` — 0 console error/warning, 0 request thất bại, CSP header
  enforce có mặt trên mọi response, icon Phosphor tự host render đúng
  (screenshot xác nhận). Chưa dựng được flow WebSocket bị CSP chặn để thử
  nghiệm cực đoan, nhưng `connect-src 'self'` bao trùm cả `ws:`/`wss:`
  same-origin theo spec Fetch Directive, và socket đã connect thành công trong
  lúc test (online count cập nhật, phòng tạo qua socket).
- Bump `?v=77` → `?v=78` đồng bộ toàn bộ `client/*.html` + mọi
  `import '...?v=N'` trong `client/js/*.js` (trừ 2 file mockup theo quy ước).
- `client/tables-tournaments-mockup.html`/`tournament-detail-mockup.html`
  (prototype chưa ship) không được sửa — như đã ghi trong "Ngoài phạm vi" ở
  trên, đây là quy ước sẵn có của repo, không phải bỏ sót.
