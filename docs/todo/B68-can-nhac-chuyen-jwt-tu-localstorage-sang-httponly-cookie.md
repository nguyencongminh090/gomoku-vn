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

**Đang chờ người dùng chốt** — thư mục thảo luận đã viết xong (2026-08-08):
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

Bảy câu hỏi mở (Q1-Q7 trong `planning.md`) cần chốt trước khi làm, trong đó Q1 là *có làm hay
không* — bảng threat model trong `user_story.md` chỉ ra `HttpOnly` chặn được **rò rỉ/tái sử dụng
token ngoài phiên** nhưng **không** chặn được lạm dụng ngay trong trang khi có XSS, nên lợi ích thật
sự có giới hạn so với chi phí chạm 10+ file ở cả hai tầng.
