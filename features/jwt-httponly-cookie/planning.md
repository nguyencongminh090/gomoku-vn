# JWT → HttpOnly cookie — Planning

Trạng thái: **ĐÃ CHỐT (2026-08-08) — phương án C.** Người dùng trả lời câu hỏi phạm vi bằng chỉ thị
*"Follow standard & real-world practices."* → chọn cơ chế mà chuẩn (OWASP/RFC 9700) **và** thực tế
site lớn (Google/GitHub: session mờ phía server) cùng chỉ tới, **không** chọn bước tối thiểu
"nhét JWT vào cookie". Điều kiện *"đừng code trước khi `planning.md` được xác nhận"* trong
`instruction.md` B68 coi như đã thoả.

## Quyết định chốt (Q1-Q7)

| | Chốt |
|---|---|
| **Q1. Có làm không** | **Có.** `localStorage` là mẫu bị OWASP khuyến cáo tường minh, không phải vùng xám. |
| **Q2. Thay `getUserInfo()`** | **(a)** — server là nguồn sự thật, phát `session:me` qua socket; `gvn_user` chỉ là cache hiển thị **không bí mật**. Không thêm route REST có xác thực nào (giữ bề mặt CSRF ở 0). |
| **Q3. SameSite** | **`Lax`** (giống `_gh_sess` của GitHub; giữ được trải nghiệm mở link phòng từ Zalo/Messenger) **+ kiểm `Origin` phía server cho socket — bắt buộc**, vì `cors.origin` không bảo vệ WebSocket. |
| **Q4. Luật CSRF tương lai** | Ghi luật + comment cảnh báo tại `verifyToken`. Chưa dựng cơ chế CSRF khi chưa có route nào dùng. |
| **Q5. Migration** | **Dual-read có thời hạn** — đổi JWT cũ trong `localStorage` lấy một phiên thật, giữ nguyên hạn còn lại. Thực tế ngành không đá sạch người dùng khi đổi hệ thống phiên, và **guest bị đá là mất phiên vĩnh viễn**. |
| **Q6. Nhánh** | `feature/jwt-httponly-cookie` off `dev` (tracking `#68` chỉ có trên `dev`). |
| **Q7. Cookie đựng gì** | **(b) — định danh phiên MỜ + bảng `sessions` phía server.** Đây là điểm cốt lõi của chỉ thị: danh tính đến từ hàng DB, không từ chứng chỉ client cầm → **thu hồi được thật**. |

**Hệ quả kèm theo của Q7 (không phải việc phụ, phải làm cùng):** `session:kicked` hiện chỉ ngắt
socket — sau thay đổi nó phải **ghi `revoked_at`** rồi mới ngắt, nếu không thì bị đá xong kết nối
lại là vào tiếp, và mục tiêu "thu hồi được" chỉ có trên giấy.

**Rủi ro đã biết, phải đo trong lúc làm (xem Q7 phụ lục):** mỗi lần bắt tay socket = một lần đọc
SQLite **đồng bộ**, chặn event loop; repo này từng đo tới 6000 kết nối đồng thời. Đo trước, chỉ
thêm cache RAM nếu số đo đòi hỏi.

Liên quan: [user_story.md](user_story.md) ·
[diagram/uml_diagram/sequence-login-and-socket-handshake.md](diagram/uml_diagram/sequence-login-and-socket-handshake.md) ·
[diagram/uml_diagram/sequence-migration-dual-read.md](diagram/uml_diagram/sequence-migration-dual-read.md) ·
[diagram/state-diagram-client-session.md](diagram/state-diagram-client-session.md)

## Kết quả khảo sát code hiện trạng (2026-08-08, nhánh `dev`)

Đây là phần thay đổi lớn nhất so với hình dung ban đầu trong `docs/todo/B68-*.md` — **quy mô nhỏ hơn
dự đoán ở phía server, nhưng lớn hơn dự đoán ở phía client.**

- **Server: chỉ đúng một chỗ xác thực token.** `verifySocketToken`
  ([server/middleware/auth.js:55-70](../../server/middleware/auth.js#L55-L70)), gắn qua `io.use()` ở
  [server/index.js:100](../../server/index.js#L100). Middleware Express `verifyToken` **được export
  nhưng chưa từng được mount ở đâu** — không có route REST nào yêu cầu đăng nhập.
- **Không có `Authorization: Bearer` ở bất kỳ đâu trong `client/js/`** (grep toàn thư mục: 0 kết
  quả). Mọi thao tác cần danh tính đều đi qua socket, không qua REST.
- **Chưa có `cookie-parser` trong `package.json`.** `express.json()` là body parser duy nhất. Socket.IO
  **không** tự parse cookie — `socket.handshake.headers.cookie` là chuỗi thô, phải tự tách (dùng gói
  `cookie` nhẹ, hoặc parse tay ~5 dòng; `cookie-parser` chỉ giúp phía Express).
- **Client đọc/giải mã JWT ở 8 chỗ**, chia làm 3 nhóm:
  1. *Chốt chặn có/không token* — `lobby.js:28`, `room.js:42`, `socket-client.js:33`
  2. *Giải mã payload lấy danh tính* — `socket-client.js:147` + bản sao ở `settings-panel.js:27`
     (gọi từ `lobby.js:70`, `room.js:51`, `tournaments.js:59`, `tournament-match.js:86`,
     `tournament-detail.js:61`, `settings-panel.js:208`)
  3. *Ghi/xoá* — `login.js:168`, `socket-client.js:95/166`, `settings-panel.js:44`
- **CORS Socket.IO hiện là `'*'` ở dev** ([server/index.js:93-96](../../server/index.js#L93-L96)).
  `origin: '*'` **không hợp lệ** khi bật `credentials` — nếu có lúc nào chạy client khác origin với
  server, phải ghim origin cụ thể. Ở cấu hình hiện tại (client static do chính server này phục vụ)
  thì luôn same-origin nên không chạm phải, nhưng đây là bẫy cần ghi rõ.
- **`app.set('trust proxy', 'loopback')`** đã có sẵn — cần cho việc suy ra HTTPS khi đặt cờ `Secure`
  sau Cloudflare Tunnel.

## Thiết kế đề xuất (tóm tắt)

| Hạng mục | Thay đổi |
|---|---|
| Cookie | `gvn_token`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` khi HTTPS, `Max-Age` = đúng `JWT_EXPIRY`/`JWT_GUEST_EXPIRY` |
| `/api/auth/{login,register,guest}` | Thêm `Set-Cookie`; **bỏ `token` khỏi body**; trả `user: { userId, displayName, isGuest, exp }` |
| `/api/auth/logout` | **Mới** — xoá cookie (`Max-Age=0`), trả 204 |
| `verifySocketToken` | Đọc `handshake.headers.cookie` trước, fallback `handshake.auth.token` trong cửa sổ chuyển tiếp |
| `socket-client.js` | Bỏ `auth:{token}`, thêm `withCredentials: true` |
| `getUserInfo()` | Không giải mã JWT nữa — đọc cache `gvn_user` (không bí mật), làm mới bằng sự kiện `session:me` từ server |
| Auth guard | Kiểm tra `gvn_user` + `exp`, không kiểm tra token |
| Migration | `POST /api/auth/upgrade-session` đổi token cũ trong `localStorage` lấy cookie, giữ nguyên `exp` |

## Ngành làm thế nào? (khảo sát 2026-08-08)

Khảo sát tài liệu chuẩn + thực tế các site lớn, để biết đề xuất trên có lệch chuẩn không. Nguồn ở
cuối mục.

### 1. Chuẩn chính thức nói gì

- **OWASP Session Management Cheat Sheet** nói thẳng: *"Do not store authentication tokens, session
  IDs, JWTs, refresh tokens, or any credential in `localStorage` or `sessionStorage`."* Khuyến nghị
  cookie với `HttpOnly` (*"mandatory to prevent session ID stealing through XSS"*), `Secure`, và
  `SameSite=Strict` (ưu tiên) hoặc `Lax`.
- **RFC 9700** (BCP bảo mật OAuth 2.0) + **draft-ietf-oauth-browser-based-apps**: khuyến nghị mạnh
  nhất là giữ token **hoàn toàn ngoài trình duyệt**, trình duyệt chỉ cầm một cookie phiên `HttpOnly`.
- → Đề xuất trong tài liệu này **đúng hướng chuẩn ngành**. Việc lưu JWT ở `localStorage` như hiện
  tại là mẫu bị khuyến cáo rõ ràng, không phải vùng xám.

### 2. Site lớn thực sự làm gì — và điểm khác biệt quan trọng

Đây là phần đáng chú ý nhất, vì nó **không phải** "giống hệt đề xuất của ta":

- **Google, GitHub không dùng JWT cho phiên trình duyệt** — họ dùng **session phía server** với một
  cookie **mờ (opaque)**: GitHub là `_gh_sess` (Rails signed cookie). Cookie chỉ mang định danh
  phiên, **không mang dữ liệu**; trạng thái nằm ở server.
- **Mẫu BFF / Token Handler** (Auth0, Curity, Duende, FusionAuth) đẩy xa hơn: token thật nằm trong
  session store phía server (Redis/DynamoDB), trình duyệt chỉ có `session_id` trong cookie
  `HttpOnly; Secure; SameSite=Strict`.
- **Mẫu lai phổ biến 2026** (Auth0/Clerk/Okta): access token **rất ngắn** (60s-15 phút) giữ **trong
  bộ nhớ JS** (không persist), refresh token dài hạn nằm trong cookie `HttpOnly` + xoay vòng
  (rotation) + phát hiện tái sử dụng.

**Lý do chính họ chọn opaque session, và nó áp thẳng vào app này: thu hồi (revocation).** JWT đã ký
thì **không thể vô hiệu hoá** trước hạn — token 7 ngày của repo này bị lộ là dùng được 7 ngày, kể
cả sau khi user đổi mật khẩu. `HttpOnly` giảm *khả năng bị lộ*, nhưng **không** thêm khả năng *thu
hồi khi đã lộ*. Đáng chú ý: app đã có `session:kicked` (đá phiên khi đăng nhập nơi khác), nhưng đó
là đá **socket đang mở**, không phải vô hiệu hoá **token** — kẻ cầm token bị đá chỉ cần kết nối lại.

### 3. WebSocket: cookie là lựa chọn *chuẩn*, không phải giải pháp chắp vá

Phát hiện củng cố cho việc chuyển sang cookie, chưa nêu trong `user_story.md`:

- **API WebSocket gốc của trình duyệt không cho đặt custom header**, nên `Authorization: Bearer`
  không dùng được lúc bắt tay. Cookie là cơ chế xác thực WS *tự nhiên* của nền tảng web; token qua
  query string bị khuyến cáo (lọt vào access log, proxy log, lịch sử trình duyệt, header `Referer`).
- App này lách được vì Socket.IO có `auth: { token }` riêng (gửi trong payload handshake của
  engine.io, không phải header) — hợp lệ, nhưng là giải pháp đặc thù thư viện, không phải chuẩn nền
  tảng.
- **Socket.IO chính thức hỗ trợ cookie**, và mặc định cookie do nó đặt là `httpOnly: true`,
  `sameSite: "lax"` — trùng đúng với thiết kế đề xuất.

### 4. ⚠ Rủi ro MỚI phải xử lý: CSWSH (Cross-Site WebSocket Hijacking)

Đây là thứ khảo sát này phát hiện thêm và **phải** đưa vào thiết kế:

- Hôm nay app **miễn nhiễm** CSWSH: một trang độc hại không thể mở socket thay mặt nạn nhân, vì nó
  không đọc được `localStorage` của origin này để lấy token.
- **Sau khi chuyển sang cookie, điều đó không còn đúng** — cookie được trình duyệt tự đính kèm. Đây
  chính xác là phiên bản WebSocket của bề mặt CSRF đã nêu ở Q4.
- **`SameSite=Lax`/`Strict` chặn được** (bắt tay WS do script khởi tạo là cross-site, không phải
  điều hướng top-level, nên cookie `Lax` không được gửi) — nhưng chuẩn ngành yêu cầu **kiểm tra
  header `Origin` phía server** như lớp phòng thủ thứ hai, không phụ thuộc mỗi `SameSite`.
- **Lưu ý cấu hình hiện tại:** `cors.origin` của Socket.IO ở `server/index.js:93-96` **không** bảo
  vệ WebSocket — trình duyệt không áp CORS cho WS. Phải kiểm `Origin` một cách tường minh
  (`allowRequest`, hoặc kiểm trong `verifySocketToken`). Hiện dev đang để `origin: '*'`.

### 5. Kết luận rút ra cho app này

1. Hướng đi (JWT → cookie `HttpOnly`) **khớp chuẩn OWASP/IETF**; không cần bàn lại phần này.
2. Nhưng chuẩn ngành **đi xa hơn một bước** mà đề xuất hiện tại chưa chạm tới: cookie mang **định
   danh phiên mờ + trạng thái ở server** (thu hồi được), thay vì mang thẳng JWT 7 ngày. Xem **Q7**.
3. Chuyển sang cookie **bắt buộc kèm kiểm `Origin`** cho socket, nếu không là đổi một lỗ hổng
   (XSS-trộm-token) lấy một lỗ hổng khác (CSWSH). Xem **Q3** đã được sửa lại.
4. Mẫu "access token ngắn trong bộ nhớ + refresh token trong cookie" là chuẩn 2026 nhưng **quá nặng**
   cho app này (cần refresh endpoint, rotation, reuse detection) — nên loại, trừ khi Q7 chọn hướng
   session phía server.

**Nguồn:**
[OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) ·
[RFC 9700 — BCP for OAuth 2.0 Security](https://www.rfc-editor.org/info/rfc9700/) ·
[draft-ietf-oauth-browser-based-apps](https://www.ietf.org/archive/id/draft-ietf-oauth-browser-based-apps-26.html) ·
[Curity — The Token Handler Pattern](https://curity.io/resources/learn/the-token-handler-pattern/) ·
[Auth0 — The BFF Pattern](https://auth0.com/blog/the-backend-for-frontend-pattern-bff/) ·
[Duende BFF — Session Management](https://docs.duendesoftware.com/bff/fundamentals/session/) ·
[FusionAuth — BFF security architecture](https://fusionauth.io/blog/backend-for-frontend-security-architecture) ·
[Socket.IO — How to deal with cookies](https://socket.io/how-to/deal-with-cookies) ·
[WebSocket.org — Security: Auth, TLS, CSWSH](https://websocket.org/guides/security/) ·
[WebSocket.org — Authentication](https://websocket.org/guides/authentication/) ·
[Stytch — JWTs vs sessions](https://stytch.com/blog/jwts-vs-sessions-which-is-right-for-you/) ·
[Okta — Cookies vs Tokens](https://developer.okta.com/blog/2022/02/08/cookies-vs-tokens)

## Câu hỏi mở — cần người dùng chốt trước khi code

**Q1. Có thực sự làm không?**
Lợi ích đã được lượng hoá trong bảng threat model ở [user_story.md](user_story.md#threat-model--hiểu-đúng-mức-lợi-ích):
chặn được *rò rỉ và tái sử dụng token ngoài phiên*, **không** chặn được *lạm dụng ngay trong trang*
khi có XSS. B65 đã hạ rủi ro XSS đáng kể. Đây là thay đổi chạm 10+ file ở cả hai tầng, cho một lợi
ích phòng thủ chiều sâu có giới hạn. Ba lựa chọn: **làm đầy đủ** / **hoãn, giữ nguyên mục #68 dạng
đã-thảo-luận** / **đóng luôn là "chấp nhận rủi ro có ý thức"**.

**Q2. Thay thế `getUserInfo()` bằng cách nào?** (đây là quyết định thiết kế lớn nhất)
- **(a) Cache `gvn_user` không bí mật + `session:me` qua socket** — không thêm round-trip HTTP, hợp
  với kiến trúc "mọi thứ đi qua socket" hiện tại. Nhược: có trạng thái "tin rằng có phiên" chưa xác
  nhận (xem [state diagram](diagram/state-diagram-client-session.md)).
- **(b) `GET /api/auth/me` đọc cookie, trả profile** — nguồn sự thật rõ ràng, đồng bộ. Nhược: thêm
  một round-trip chặn trước mỗi lần tải trang, và tạo ra **route REST có xác thực đầu tiên** của
  repo → mở màn cho vấn đề CSRF ở Q4.
- **(c) Cookie thứ hai không `HttpOnly` chứa profile** — không cần code client mới ngoài chỗ đọc.
  Nhược: hai cookie phải hết hạn đồng bộ, dễ lệch.
  → Khuyến nghị: **(a)**, vì nó không tạo thêm bề mặt REST nào.

**Q3. `SameSite=Lax` hay `Strict`? — và kiểm `Origin` (đã sửa sau khảo sát ngành)**
App không có luồng quay-về từ site ngoài (không OAuth, không thanh toán), nên `Strict` không làm
hỏng gì và chặt hơn. `Lax` an toàn hơn cho tương lai (ví dụ chia sẻ link phòng chơi qua Zalo/Messenger —
với `Strict`, lần điều hướng đầu từ app ngoài vào sẽ **không** kèm cookie và user thấy màn hình đăng
nhập dù đang có phiên). → Khuyến nghị **`Lax`**, nhưng cần chốt vì nó ảnh hưởng trải nghiệm chia sẻ
link.

> **Bổ sung bắt buộc, không phải tuỳ chọn:** dù chọn `Lax` hay `Strict`, phải **kiểm header `Origin`
> phía server cho kết nối socket** (chống CSWSH — xem mục "Ngành làm thế nào?" §4). `SameSite` một
> mình về lý thuyết là đủ, nhưng chuẩn ngành không cho phép phụ thuộc một lớp duy nhất, và
> `cors.origin` của Socket.IO **không** bảo vệ WebSocket (trình duyệt không áp CORS cho WS). Nếu bỏ
> qua bước này thì việc chuyển sang cookie là đổi lỗ hổng XSS-trộm-token lấy lỗ hổng CSWSH — tệ
> hơn nguyên trạng. Cần chốt: kiểm `Origin` trong `allowRequest` hay trong `verifySocketToken`, và
> lấy origin hợp lệ từ đâu (biến môi trường `CORS_ORIGIN` sẵn có?).

**Q4. Quy tắc CSRF cho tương lai.**
Hôm nay không có route REST nào xác thực → không có bề mặt CSRF. Nhưng sau khi có cookie, route đầu
tiên gắn `verifyToken` sẽ **âm thầm** có lỗ hổng CSRF nếu không ai nhớ. Cần chốt hình thức ràng
buộc: ghi luật vào `CLAUDE.md`? Thêm sẵn cơ chế double-submit CSRF token ngay cả khi chưa dùng tới?
Hay xoá luôn `verifyToken` (đang chết) để bất kỳ ai muốn thêm route xác thực đều buộc phải viết
mới và đọc tài liệu này?
→ Khuyến nghị: ghi luật vào `CLAUDE.md` **và** thêm comment cảnh báo ngay tại `verifyToken`; chưa
dựng cơ chế CSRF khi chưa có nơi dùng.

**Q5. Migration: dual-read hay đá sạch một lần?**
Xem [sequence-migration-dual-read.md](diagram/uml_diagram/sequence-migration-dual-read.md). Dual-read
giữ phiên cho mọi người (quan trọng nhất với **guest** — bị đá là mất phiên vĩnh viễn, không đăng
nhập lại được) nhưng thêm một endpoint + một nhánh fallback phải nhớ xoá sau 7 ngày. Đá sạch đơn
giản hơn nhiều và với quy mô app hiện tại có thể chấp nhận được.
→ Cần biết: app đang có bao nhiêu người dùng thực tế? Nếu rất ít, chọn **đá sạch**.

**Q6. Nhánh làm việc: `feature/*` off `dev` hay `fix/*`?**
Đây không phải sửa lỗi mà là thay đổi kiến trúc auth → theo `CLAUDE.md` phải là
`feature/jwt-httponly-cookie` nhánh từ `dev`. Ngoài ra tracking `#68` **chỉ tồn tại trên `dev`**
(đã kiểm tra), nên nền tảng phải là `dev` dù thế nào. Cần xác nhận không có lý do gì để đưa thẳng
lên `main`.

**Q7. Cookie mang JWT, hay mang định danh phiên mờ (opaque) + trạng thái ở server?**
*(câu hỏi mới, phát sinh từ khảo sát ngành — xem mục "Ngành làm thế nào?" §2)*
Đề xuất ban đầu chỉ **đổi chỗ chứa** JWT: cookie đựng nguyên JWT 7 ngày như cũ. Google/GitHub và mẫu
BFF không làm vậy — cookie của họ mang một **định danh phiên mờ**, dữ liệu nằm ở server, nhờ đó
**thu hồi được ngay lập tức**.
- **(a) Cookie đựng JWT (đề xuất hiện tại)** — thay đổi tối thiểu, không thêm hạ tầng lưu trữ. Nhược:
  vẫn **không thu hồi được** — token lộ là dùng được tới 7 ngày, kể cả sau khi đổi mật khẩu; và
  `session:kicked` hiện có vẫn chỉ đá socket chứ không giết token.
- **(b) Cookie đựng session id mờ, phiên lưu ở server** — thu hồi được thật, đăng xuất là thu hồi
  thật, mở đường cho "đăng xuất mọi thiết bị". Nhược: cần một session store. App đã có **SQLite
  (`better-sqlite3`) đồng bộ, chạy sẵn** nên chi phí thấp hơn nhiều so với dựng Redis — nhưng
  **guest** thì không có bản ghi user, cần bảng phiên riêng, và mọi lần bắt tay socket thành một lần
  đọc DB.
→ Chưa khuyến nghị dứt khoát. **(b) đúng chuẩn ngành hơn và giải quyết một vấn đề thật (không thu
hồi được) mà (a) không chạm tới** — nhưng nó biến task này từ "đổi chỗ lưu token" thành "làm lại
tầng phiên", vượt xa phạm vi #68 ban đầu. Nếu người dùng thấy khả năng thu hồi là quan trọng, nên
tách thành mục riêng thay vì nhồi vào #68.

### Q7 phụ lục — làm theo (b) có khả thi với repo này không? (khảo sát 2026-08-08)

Câu hỏi của người dùng: *"Could we implement mechanics as big tech did?"* — **Có, và rẻ hơn thông
thường**, vì bốn điều kiện thuận lợi có sẵn trong repo. Nhưng có đúng một rủi ro thật cần đo trước.

**Vì sao rẻ hơn ở đây:**

1. **Không cần dựng Redis — SQLite đã chạy sẵn và *đồng bộ*.** Lý do các hướng dẫn BFF luôn kèm
   Redis/DynamoDB là vì phải tra phiên trên mỗi request mà không được chặn event loop. `better-sqlite3`
   (`server/db/database.js:14,25`) là **in-process, đồng bộ** — một `SELECT` theo khoá chính là lời gọi
   hàm sub-millisecond, không `await`, không thêm dịch vụ, không thêm điểm hỏng. Phần hạ tầng đắt nhất
   của mẫu BFF vốn đã có.
2. **Đã có sẵn khái niệm "session registry", chỉ là chưa bền vững.**
   `sessions` Map (`server/socket/state.js:59`) ánh xạ `userId` → socket đang sống, và
   `SocketHandler.js:119-126` dùng nó để ép **một thiết bị một tài khoản** (`session:kicked`). Nghĩa
   là mô hình phiên *đã* tồn tại về mặt khái niệm — nó chỉ nằm trong RAM, một tiến trình, và **đá
   socket chứ không thu hồi chứng chỉ**. Chuyển sang (b) là làm cho thứ đang có trở nên thật, không
   phải phát minh khái niệm mới.
3. **Schema đã có sẵn khuôn mẫu "guest không có bản ghi user".** Guest mang id `guest_<uuid8>` và
   **không bao giờ** được ghi vào bảng `users` (`auth.js:221`). Bảng `sessions` vì thế **không được**
   `REFERENCES users(id)` — nhưng đây là bài toán schema đã giải hai lần rồi:
   `games.black_player_id` ("null for guests") và `tournament_players` (khoá chính là `entry_id`,
   `player_id` nullable). Bảng phiên đi theo đúng khuôn đó: khoá chính là `id` phiên, `user_id`
   nullable, kèm `display_name` + `is_guest`.
4. **Đã có sẵn cơ chế migration schema tại chỗ.** `database.js:39,48` dùng `PRAGMA table_info(...)`
   để thêm cột cho DB cũ mà không cần công cụ migration — thêm một bảng qua `CREATE TABLE IF NOT
   EXISTS` trong `schema.sql` là thao tác đã có tiền lệ, DB hiện có của người dùng không việc gì.

**Phác thảo (chưa code):**

```sql
-- server/db/schema.sql — CỐ Ý không REFERENCES users(id): guest không có bản ghi user,
-- cùng khuôn với games.black_player_id / tournament_players.player_id.
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,   -- 256-bit ngẫu nhiên (crypto.randomBytes(32).toString('base64url')) — MỜ, không phải JWT
  user_id       TEXT,               -- null với guest
  display_name  TEXT NOT NULL,
  is_guest      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  expires_at    TEXT NOT NULL,      -- 7 ngày / 24h, giữ nguyên chính sách hiện tại
  revoked_at    TEXT                -- non-null = đã thu hồi (đăng xuất, bị đá, đổi mật khẩu)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
```

- Cookie chứa **đúng `sessions.id`** — không ký, không payload, không có gì để giải mã. `jsonwebtoken`
  biến mất khỏi đường xác thực (vẫn có thể giữ cho mục đích khác, nhưng auth thì không dùng nữa).
- `verifySocketToken` → tra phiên: `SELECT` theo id, kiểm `revoked_at IS NULL AND expires_at > now`,
  gán `socket.user` từ hàng đó. **Danh tính lấy từ DB, không từ chứng chỉ do client cầm** — đây chính
  là điểm khác biệt cốt lõi của mẫu big-tech.
- `session:kicked` trở thành **thu hồi thật**: đặt `revoked_at` cho phiên cũ *rồi mới* ngắt socket.
  Hôm nay bị đá xong kết nối lại là vào tiếp; sau đổi thì không.
- Mở đường (không bắt buộc làm ngay) cho: "đăng xuất mọi thiết bị", đổi mật khẩu là huỷ mọi phiên,
  danh sách phiên đang hoạt động.

**Rủi ro thật, phải đo trước khi chốt — không được bỏ qua:**

- **Mỗi lần bắt tay socket = một lần đọc SQLite đồng bộ, tức là *chặn event loop*.** Bình thường
  không sao (sub-ms), nhưng repo này có lịch sử đo tải rõ ràng: `docs/stress-test-report.md` §10 và
  `TODO.md` #28/#29 đo tới **6000 kết nối đồng thời**, và chính vì burst đó mà `transports` được đổi
  sang websocket-first. Một `SELECT` đồng bộ nhân với burst 6000 kết nối là thứ **phải đo**, không
  phải suy đoán — đúng tinh thần quy tắc "Root-cause diagnosis" trong `CLAUDE.md` (đo ở điều kiện
  giống production, không chỉ ở dev).
- Giảm nhẹ nếu số đo xấu: **cache phiên trong RAM, DB là lớp bền vững** (đọc DB chỉ khi cache miss)
  — vẫn thu hồi được ngay vì thu hồi ghi cả hai nơi. Nhưng chỉ làm khi số đo đòi hỏi, không làm sẵn.
- **Cần một tác vụ dọn phiên hết hạn** (hôm nay JWT tự hết hạn, không cần dọn gì). Đơn giản: xoá
  `expires_at < now` lúc khởi động + định kỳ.

**Kết luận Q7:** khả thi và phù hợp repo. Nhưng cần nói rõ để người dùng chốt: đây **không còn là
#68 nữa**. #68 hỏi "token nằm ở đâu"; (b) trả lời "phiên được quản lý thế nào". Khuyến nghị nếu
chọn (b): **tách thành mục `TODO.md` riêng** (vd. "Phiên phía server + thu hồi được"), và làm #68
theo phương án (a) trước hoặc gộp luôn — xem ba lựa chọn ở cuối tài liệu này.

### Ba lựa chọn phạm vi, để người dùng chốt

| | Phạm vi | Được gì | Chi phí |
|---|---|---|---|
| **A. Chỉ #68 (a)** | Cookie đựng JWT + kiểm `Origin` | Hết XSS-trộm-token; đúng chuẩn OWASP | ~10 file, 2 tầng, không thêm bảng DB |
| **B. #68 (a) rồi mục mới (b)** | Làm A trước, phiên phía server sau | Như A, rồi thêm thu hồi thật; mỗi bước kiểm chứng được riêng | Hai đợt, phải migrate hai lần |
| **C. Nhảy thẳng (b)** | Cookie mờ + bảng `sessions` ngay | Đúng mẫu big-tech ngay, chỉ migrate một lần | Lớn nhất; phải đo tải bắt tay trước |

→ Khuyến nghị ban đầu là **B**. **Người dùng chọn C** (2026-08-08, *"Follow standard & real-world
practices"*) — làm thẳng cơ chế mà chuẩn và site lớn dùng, chỉ migrate một lần. Phép đo tải bắt tay
vì thế chuyển từ "điều kiện tiên quyết trước khi chốt" thành **một bước bắt buộc trong lúc làm**.

## Trình tự triển khai (đã chốt phương án C)

1. **DB — bảng `sessions`** trong `schema.sql` (theo phác thảo ở Q7 phụ lục: `CREATE TABLE IF NOT
   EXISTS`, **không** `REFERENCES users(id)` vì guest), + CRUD trong `database.js`.
2. **Server — `SessionManager`**: tạo phiên (id mờ 256-bit từ `crypto.randomBytes`), tra cứu, thu
   hồi, dọn phiên hết hạn.
3. **Server — cookie helper** ở một chỗ duy nhất: `setSessionCookie` / `clearSessionCookie`
   (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` suy từ `req.secure`/`X-Forwarded-Proto` nhờ
   `trust proxy` sẵn có, `Max-Age` = hạn phiên).
4. **Server — 3 route `/api/auth/*`**: tạo phiên + `Set-Cookie`, **bỏ `token` khỏi body**. Thêm
   `POST /api/auth/logout` (thu hồi thật) và `POST /api/auth/upgrade-session` (migration Q5).
5. **Server — `verifySocketToken` → tra phiên từ cookie** + **kiểm `Origin`** (CSWSH, Q3). Giữ
   fallback JWT `auth.token` trong cửa sổ chuyển tiếp.
6. **Server — `session:kicked` ghi `revoked_at`** trước khi ngắt socket.
7. **Server — `session:me`** phát ngay sau khi kết nối (Q2).
8. **Client — gộp hai bản `getUserInfo()` trùng lặp làm một** *trước khi* đổi cách nó hoạt động;
   `socket-client.js` và `settings-panel.js` đang có hai bản chép gần như y hệt — sửa một mà quên
   bản kia là kịch bản lỗi rõ ràng nhất của cả task này.
9. **Client — auth guard + `_connect()` + `logout()` + migration một lần** theo thiết kế đã chốt.
10. **Đo tải bắt tay** (rủi ro đã biết ở Q7 phụ lục) — chỉ thêm cache RAM nếu số đo đòi hỏi.
11. **Bump `?v=N`** — task này chạm `client/js/*.js` nên bắt buộc theo quy tắc cache-busting trong
    `CLAUDE.md`, kể cả cross-import giữa các module không phải `*-entry.js`. Kiểm bằng
    `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` → phải ra **đúng một** giá trị.
12. **Xoá nhánh fallback JWT + `/upgrade-session`** sau ≥7 ngày, commit dọn dẹp riêng.

## Kế hoạch kiểm thử

**Backend (Jest, `server/tests/**/*.test.js`)** — theo quy tắc "Writing comprehensive test cases":

- `verifySocketToken` — bảng quyết định (phiên hợp lệ / id phiên không tồn tại / phiên **đã thu
  hồi** / phiên **hết hạn** / không cookie nhưng có JWT `auth.token` hợp lệ (cửa sổ chuyển tiếp) /
  không có gì / có **cả hai** và lệch nhau → cookie phải thắng / header `cookie` lẫn nhiều cookie
  khác / chuỗi cookie dị dạng không được làm crash).
- **Kiểm `Origin`** — cùng origin qua / origin lạ bị chặn / **thiếu header `Origin`** (client không
  phải trình duyệt) phải có hành vi xác định, không được crash.
- Vòng đời phiên — tạo/tra/thu hồi/hết hạn; **thu hồi rồi thì tra lại phải trượt** (đây là khẳng
  định chứng minh mục tiêu "thu hồi được" đã đạt, không chỉ ghi cột).
- **Guest**: phiên guest tạo được **mà không** có hàng trong `users` (bảng `sessions` không được
  ràng buộc khoá ngoại tới `users`) — chính là bẫy schema đã nêu ở Q7 phụ lục.
- Thuộc tính cookie ở `/api/auth/{login,register,guest}` — `HttpOnly`, `SameSite`, `Path`,
  `Max-Age` đúng theo từng loại (7d vs 24h guest), và `Secure` **bật khi HTTPS, tắt khi HTTP** (chỗ
  dev/prod dễ lệch nhất).
- Body của 3 route đó **không còn** trường `token`, và **không** rò `sessions.id` ra ngoài
  `Set-Cookie` (id phiên là bí mật ngang token — lọt vào body là quay lại đúng vấn đề cũ).
- `/api/auth/logout` thu hồi phiên **và** xoá cookie đúng cùng `Path`/`SameSite` (sai `Path` thì
  cookie không bị xoá).
- `/api/auth/upgrade-session` — JWT cũ hợp lệ → tạo phiên **giữ nguyên hạn còn lại** (không gia hạn
  thêm 7 ngày); JWT hết hạn/hỏng → 401, không tạo phiên.
- Giữ nguyên khẳng định `Cache-Control: no-store` đã có từ #66 — giờ càng quan trọng vì response
  mang `Set-Cookie`.

**Frontend** — `client/js/` chưa có test runner tự động; theo "Feature completion checklist" phải
kiểm bằng trình duyệt thật, tuân thủ quy tắc e2e/db-safety (dời `server/db/gomoku.db` ra trước khi
chạy server, khôi phục sau). Kịch bản tối thiểu: đăng nhập → lobby hiện đúng tên → tạo/vào phòng →
**mở tab thứ hai** (kiểm ràng buộc chia sẻ nhiều tab ở `socket-client.js:101-114`) → guest flow →
đăng xuất → back-button sau khi đăng xuất **không** vào lại được lobby → xoá cookie thủ công trong
devtools rồi reload (kiểm trạng thái `TinCoPhien` lệch) → và **xác nhận `document.cookie` trong
console KHÔNG thấy `gvn_token`** — đây là phép thử duy nhất chứng minh mục tiêu của cả task đã đạt.

## Bàn giao — ĐÃ THỰC HIỆN (2026-08-08)

Q1-Q7 đã chốt (bảng đầu tài liệu). `docs/todo/B68-*.md` và `docs/instruction/B68-*.md` đã được cập
nhật theo quyết định C, giữ nguyên mã `B68`/`#68` (không tạo mục mới). Việc code diễn ra trên
`feature/jwt-httponly-cookie` nhánh từ `dev`.

Ghi chú phạm vi: Q7 biến #68 từ *"token nằm ở đâu"* thành *"phiên được quản lý thế nào"*. Người
dùng đã chọn gộp, nên **không** tách mục `TODO.md` mới — nhưng phần "thu hồi được" là năng lực mới,
cần được nêu rõ trong `docs/todo/B68-*.md` để về sau đọc lại không tưởng #68 chỉ là đổi chỗ lưu.
