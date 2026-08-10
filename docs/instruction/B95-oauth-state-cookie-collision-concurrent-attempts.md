# B95 — OAuth state cookie bị đè khi 2 lần thử đăng nhập Google gần-đồng-thời

Hướng dẫn thực thi cho TODO.md #95 (chưa làm — chỉ ghi lại khi phát hiện qua `/code-review`).

## Cách tiếp cận khi làm

- **Đổi cách xác thực state sang self-describing (double-submit cookie đúng chuẩn)** thay vì so
  sánh giá trị cookie (đặt tên cố định `gvn_oauth_state`) với query param `state` như hiện tại — vì
  chính cái tên cố định đó là nguồn gốc đè lẫn nhau. Hướng đơn giản nhất: giữ nguyên cơ chế
  (cookie chứa state ngẫu nhiên, callback so với query param), chỉ cần đảm bảo 2 lần thử song song
  không dùng chung 1 slot cookie — có thể dùng chính giá trị `state` làm 1 phần tên cookie, hoặc
  chấp nhận đơn giản hơn: không sửa gì (double-submit cookie pattern chuẩn vốn CHỈ cần so khớp giá
  trị, không cần disambiguate nhiều phiên) và thay vào đó sửa Ở ĐIỂM SO SÁNH — không dùng
  `res.clearCookie` trong nhánh lỗi tới khi chắc chắn cookie đó thuộc về chính request đang xử lý.
- **Cân nhắc kỹ trước khi đổi cấu trúc cookie** — đây là cookie bảo mật (chống CSRF cho luồng OAuth),
  đổi sai có thể vô tình làm yếu bảo vệ CSRF thay vì chỉ sửa bug UX. Nên viết test mô phỏng 2 request
  `/google` liên tiếp rồi 2 callback tương ứng để xác nhận cả 2 đều thành công trước khi coi là xong.
- **Viết test bằng cách gọi trực tiếp route** (theo khuôn mẫu `server/tests/auth-google-oauth.test.js`),
  giả lập 2 `GET /google` liên tiếp lấy 2 `Set-Cookie` khác nhau, rồi xác nhận cả 2 callback tương ứng
  (đúng cookie của từng lần) đều pass.

## Phạm vi KHÔNG làm

- Không đổi cơ chế session cookie chính (`session-cookie.js`) — chỉ phạm vi cookie state OAuth riêng.
- Không đổi luồng OAuth cơ bản (redirect_uri, PKCE, v.v.) — chỉ sửa cách lưu/so state.

Xem báo cáo gốc: [docs/todo/B95-oauth-state-cookie-collision-concurrent-attempts.md](../todo/B95-oauth-state-cookie-collision-concurrent-attempts.md).
