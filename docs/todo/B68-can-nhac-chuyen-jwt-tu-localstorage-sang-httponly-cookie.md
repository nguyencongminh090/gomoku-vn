# Phần B #68. Cân nhắc chuyển JWT từ `localStorage` sang `HttpOnly` cookie

**Nguồn:** báo cáo `network_security_audit.md` (Antigravity IDE, 2026-08-08); đã nêu ở [[B65]] mục
"Ngoài phạm vi" — *"Không đổi `localStorage` sang cookie chỉ vì finding này. Cookie `HttpOnly` là một
quyết định auth/CSRF lớn, cần threat model và migration riêng."* Mục này là task riêng đó.

## Vấn đề đã xác nhận

`gvn_token` (JWT, hạn 7 ngày cho user thường / 24h cho guest) lưu ở `localStorage` — đọc được bởi
bất kỳ JS nào chạy cùng origin. [[B65]] đã chặn script bên thứ ba không tin cậy chạy trong origin
(CSP `script-src 'self'`, bỏ unpkg), giảm mạnh bề mặt tấn công XSS, nhưng không loại bỏ hoàn toàn
rủi ro nếu tương lai có lỗ hổng XSS tự thân (vd. một field user-controlled render sai chỗ).
`HttpOnly` cookie sẽ khiến token không đọc được bằng JS ngay cả khi có XSS.

## Việc cần làm (nếu quyết định làm)

- Đây là thay đổi kiến trúc auth, KHÔNG làm trực tiếp — cần `features/<slug>/` thảo luận trước theo
  quy tắc "New requirements/tasks" trong `CLAUDE.md`: đánh giá CSRF (cookie cần
  `SameSite`/CSRF token đi kèm), tác động lên Socket.IO handshake hiện đang gửi token qua
  `auth: { token }` (client đọc từ `localStorage` — nếu chuyển cookie, cần cơ chế khác để socket lấy
  token, vd. cookie tự động gửi kèm HTTP upgrade request, cần đọc lại `SocketHandler.js` xử lý auth
  thế nào), và migration cho user đang có token cũ trong `localStorage`.
- Không tự quyết định đây là bug cần sửa — độ ưu tiên thấp vì [[B65]] đã giảm rủi ro XSS đáng kể;
  ghi nhận là cải thiện phòng thủ theo chiều sâu (defense-in-depth), không phải lỗ hổng đang bị khai
  thác được.

## Trạng thái

**✅ ĐÃ XONG** (2026-08-08) — nhánh `feature/jwt-httponly-cookie` (từ `dev`).
Fix log: [`docs/fix-log/2026-08-08-todo-68-server-side-sessions-httponly-cookie.md`](../fix-log/2026-08-08-todo-68-server-side-sessions-httponly-cookie.md).

### Đã làm

- Bảng `sessions` (id mờ 256-bit từ `crypto.randomBytes`, **không** khoá ngoại tới `users` vì
  guest), `managers/SessionManager.js`, `utils/session-cookie.js` (một chỗ duy nhất định nghĩa
  cookie; `Secure` suy từ `req.secure`).
- 3 route `/api/auth/*` cấp phiên qua `Set-Cookie` và **bỏ `token` khỏi body**; thêm
  `POST /logout` (thu hồi thật) và `POST /upgrade-session` (migration, giữ nguyên hạn còn lại).
- `verifySocketToken`: kiểm `Origin` (CSWSH) → tra phiên từ cookie; fallback JWT **chỉ khi không có
  cookie** (cookie chết không rơi xuống fallback).
- `session:kicked` ghi `revoked_at` trước khi ngắt socket → đá phiên giờ là **thu hồi thật**.
- Client: `session.js` mới thay **hai bản `getUserInfo()` trùng lặp**; identity đổi sang getter
  sống ở `RoomState` + 4 trang; logout thành network call có xử lý thất bại; `?v=79` → `?v=80`.

### Kiểm chứng

- **Jest 931/931 xanh** (thêm 76 test mới: vòng đời phiên, thu hồi, bảng quyết định socket auth,
  thuộc tính cookie, `Origin`, migration). Test phiên chạy trên SQLite thật nạp từ `schema.sql` với
  `foreign_keys = ON` — chính là thứ bắt được lỗi khoá ngoại làm chết phiên guest.
- **Trình duyệt 26/26** (db thật đã dời ra và khôi phục, md5 khớp). Phép thử quyết định:
  `document.cookie` **rỗng**, không còn credential nào trong `localStorage`.
- **Đo tải:** burst 6000 kết nối, bảng 100k hàng → chặn event loop tổng 58,6 ms (p50 7,9 µs).
  **Không thêm cache RAM.**

### Còn nợ

Xoá fallback JWT trong `verifySocketToken` + endpoint `/upgrade-session` + `migrateLegacyToken()`
sau **≥7 ngày** kể từ khi deploy (bằng `JWT_EXPIRY` dài nhất) — `planning.md` bước 12. Để lại vĩnh
viễn sẽ vô hiệu hoá chính mục tiêu của #68.

---

*(lịch sử) Thảo luận trước khi code — thư mục đã viết xong 2026-08-08:*
[`features/jwt-httponly-cookie/`](../../features/jwt-httponly-cookie/planning.md). Chưa code dòng
nào, đúng theo `instruction.md` B68 (*"Đừng bắt đầu sửa code trước khi `planning.md` được người dùng
xác nhận"*).

Phát hiện quan trọng từ khảo sát code (làm thay đổi hình dung ban đầu ở mục "Việc cần làm" bên trên):

- **Phía server nhỏ hơn dự đoán:** JWT chỉ được xác thực ở đúng một chỗ — `verifySocketToken`
  (`io.use()` ở `server/index.js:100`). Middleware Express `verifyToken` được export nhưng **chưa
  từng được mount** ở route nào, và không có `Authorization: Bearer` nào trong `client/js/`. Vì vậy
  bề mặt CSRF hôm nay gần như bằng không — rủi ro là *tương lai*, khi ai đó thêm route REST có xác
  thực mà quên rằng giờ đã có cookie tự động gửi kèm.
- **Phía client lớn hơn dự đoán:** không chỉ là handshake socket. `getUserInfo()` giải mã payload
  JWT bằng JS (`atob`) để lấy `userId`/`displayName`/`isGuest`, tồn tại **hai bản sao gần như y
  hệt** (`socket-client.js:147`, `settings-panel.js:27`) với 6 nơi gọi. `HttpOnly` xoá bỏ hoàn toàn
  cơ chế này → phải thay bằng nguồn danh tính khác. Đây mới là điểm chặn lớn nhất.
- **Đăng xuất trở thành thao tác có thể thất bại**: hiện `logout()` chỉ là `removeItem` thuần
  client; với `HttpOnly` phải thêm `POST /api/auth/logout`, và xử lý trường hợp lỗi mạng (nếu vẫn
  chuyển trang như cũ thì cookie còn sống → chính bản sửa bảo mật tạo ra hồi quy bảo mật).

## Quyết định (2026-08-08) — phương án C, phiên phía server

Người dùng chốt bằng chỉ thị *"Follow standard & real-world practices."* → làm theo cơ chế mà chuẩn
(OWASP, RFC 9700) **và** thực tế site lớn (Google/GitHub dùng session mờ phía server) cùng chỉ tới,
**không** dừng ở bước tối thiểu "nhét JWT vào cookie". Toàn bộ Q1-Q7 đã chốt — xem bảng quyết định
đầu [`features/jwt-httponly-cookie/planning.md`](../../features/jwt-httponly-cookie/planning.md).

**⚠ Phạm vi #68 đã mở rộng so với tiêu đề mục này.** Tiêu đề hỏi *"token nằm ở đâu"*; quyết định C
trả lời *"phiên được quản lý thế nào"*. Cụ thể:

- Cookie mang **định danh phiên mờ 256-bit**, không phải JWT. Bảng `sessions` mới trong SQLite giữ
  trạng thái; danh tính lấy từ hàng DB, không từ chứng chỉ client cầm.
- **Năng lực mới: thu hồi được (revocation)** — thứ JWT stateless không có. `session:kicked` từ chỗ
  chỉ ngắt socket (kết nối lại là vào tiếp) trở thành thu hồi thật; đăng xuất trở thành thu hồi thật.
- Kèm theo bắt buộc: **kiểm header `Origin` cho socket** (chống CSWSH — cookie mở ra bề mặt này,
  `localStorage` thì không, và `cors.origin` của Socket.IO **không** bảo vệ WebSocket).
- Migration dual-read có thời hạn để không đá sạch phiên đang mở (đặc biệt **guest**, bị đá là mất
  phiên vĩnh viễn).

Người dùng chọn **gộp vào #68** thay vì tách mục mới, nên mục này giờ bao cả hai việc.

**Rủi ro đã biết, phải đo trong lúc làm:** mỗi lần bắt tay socket thành một lần đọc SQLite **đồng
bộ** (chặn event loop); repo từng đo tới 6000 kết nối đồng thời (`docs/stress-test-report.md` §10,
`TODO.md` #28/#29). Đo trước, chỉ thêm cache RAM nếu số đo đòi hỏi.
