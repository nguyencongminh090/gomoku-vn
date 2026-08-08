# JWT → HttpOnly cookie — Planning

Trạng thái: **đang thảo luận, CHƯA được duyệt để code.** Theo `instruction.md` B68: *"Đừng bắt đầu
sửa code trước khi `planning.md` được người dùng xác nhận."*

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

**Q3. `SameSite=Lax` hay `Strict`?**
App không có luồng quay-về từ site ngoài (không OAuth, không thanh toán), nên `Strict` không làm
hỏng gì và chặt hơn. `Lax` an toàn hơn cho tương lai (ví dụ chia sẻ link phòng chơi qua Zalo/Messenger —
với `Strict`, lần điều hướng đầu từ app ngoài vào sẽ **không** kèm cookie và user thấy màn hình đăng
nhập dù đang có phiên). → Khuyến nghị **`Lax`**, nhưng cần chốt vì nó ảnh hưởng trải nghiệm chia sẻ
link.

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

## Trình tự triển khai (chỉ thực hiện sau khi Q1-Q6 được chốt)

1. **Server — nền tảng cookie.** Thêm helper `setAuthCookie(res, token, maxAge)` / `clearAuthCookie(res)`
   ở một chỗ duy nhất (cờ `Secure` suy từ `req.secure`/`X-Forwarded-Proto`, dùng `trust proxy` sẵn có).
   Sửa 3 route `/api/auth/*`. Thêm `/api/auth/logout`.
2. **Server — `verifySocketToken` đọc cookie**, fallback `auth.token` (nếu chọn dual-read ở Q5).
3. **Server — sự kiện `session:me`** (nếu chọn (a) ở Q2) phát ngay sau khi kết nối thành công.
4. **Client — gộp hai bản `getUserInfo()` trùng lặp làm một** trước khi đổi cách nó hoạt động; hiện
   `socket-client.js` và `settings-panel.js` có hai bản sao chép gần như y hệt, sửa một mà quên bản
   kia là kịch bản lỗi rõ ràng nhất của cả task này.
5. **Client — auth guard + `socket-client._connect()` + `logout()`** theo thiết kế đã chốt.
6. **Migration** (nếu chọn dual-read).
7. **Bump `?v=N`** — task này chạm `client/js/*.js` nên bắt buộc theo quy tắc cache-busting trong
   `CLAUDE.md`, kể cả các cross-import giữa các module không phải `*-entry.js`. Kiểm tra bằng
   `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` → phải ra **đúng một** giá trị.
8. **Xoá nhánh fallback** sau ≥7 ngày, commit dọn dẹp riêng.

## Kế hoạch kiểm thử

**Backend (Jest, `server/tests/**/*.test.js`)** — theo quy tắc "Writing comprehensive test cases":

- `verifySocketToken` — bảng quyết định (cookie hợp lệ / cookie hỏng / cookie hết hạn / không cookie
  nhưng có `auth.token` hợp lệ / không cả hai / có **cả hai** và lệch nhau → cookie phải thắng /
  header `cookie` có nhiều cookie khác lẫn vào / chuỗi cookie dị dạng không được làm crash).
- Thuộc tính cookie ở `/api/auth/{login,register,guest}` — khẳng định **có** `HttpOnly`, `SameSite`,
  `Path`, `Max-Age` đúng theo từng loại (7d vs 24h guest), và `Secure` **bật khi HTTPS, tắt khi
  HTTP** (đây là chỗ dev/prod dễ lệch nhất).
- Body của 3 route đó **không còn** trường `token` (chống rò ngược).
- `/api/auth/logout` xoá cookie đúng cùng `Path`/`SameSite` (sai `Path` thì cookie không bị xoá).
- Giữ nguyên khẳng định `Cache-Control: no-store` đã có từ #66 — giờ càng quan trọng vì response
  mang `Set-Cookie`.

**Frontend** — `client/js/` chưa có test runner tự động; theo "Feature completion checklist" phải
kiểm bằng trình duyệt thật, tuân thủ quy tắc e2e/db-safety (dời `server/db/gomoku.db` ra trước khi
chạy server, khôi phục sau). Kịch bản tối thiểu: đăng nhập → lobby hiện đúng tên → tạo/vào phòng →
**mở tab thứ hai** (kiểm ràng buộc chia sẻ nhiều tab ở `socket-client.js:101-114`) → guest flow →
đăng xuất → back-button sau khi đăng xuất **không** vào lại được lobby → xoá cookie thủ công trong
devtools rồi reload (kiểm trạng thái `TinCoPhien` lệch) → và **xác nhận `document.cookie` trong
console KHÔNG thấy `gvn_token`** — đây là phép thử duy nhất chứng minh mục tiêu của cả task đã đạt.

## Bàn giao (bước cuối của thảo luận)

Sau khi Q1-Q6 được chốt với người dùng, chuyển tài liệu này thành công việc theo dõi được:
cập nhật `docs/todo/B68-can-nhac-chuyen-jwt-tu-localstorage-sang-httponly-cookie.md` +
`docs/instruction/B68-...md` với quyết định đã chốt và trình tự trên (giữ nguyên mã `B68`/`#68`,
không tạo mục mới — mục này đã tồn tại), rồi mới bắt đầu code trên
`feature/jwt-httponly-cookie` nhánh từ `dev`. Nếu Q1 chốt là "hoãn"/"đóng", cập nhật
`docs/todo/B68-*.md` phản ánh quyết định đó và trỏ về thư mục này làm căn cứ.
