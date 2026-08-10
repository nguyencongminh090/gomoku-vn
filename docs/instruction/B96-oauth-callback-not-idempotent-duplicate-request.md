# B96 — `GET /google/callback` không idempotent khi request bị lặp lại

Hướng dẫn thực thi cho TODO.md #96 (chưa làm — chỉ ghi lại khi phát hiện qua `/code-review`).

## Cách tiếp cận khi làm

- **Phân biệt "state cookie không có vì đã bị request khác xử lý xong" với "state cookie không có vì
  giả mạo/hết hạn thật"** — hiện cả 2 đều rơi vào cùng nhánh lỗi. Có thể thêm 1 kiểm tra: nếu không có
  state cookie NHƯNG người dùng đã có session hợp lệ (đọc được session cookie chính), coi như "phiên
  trước đã xử lý xong" và redirect thẳng về `oauth-complete.html`/trang chủ thay vì báo lỗi.
- **Cân nhắc mức độ ưu tiên trước khi làm** — đây là race hiếm (cần 2 request cho đúng cùng 1 `code`
  gần như đồng thời), nên hỏi lại người dùng có thực sự cần ưu tiên hay để đó.
- **Viết test giả lập gọi `googleClient.getToken` 2 lần liên tiếp cùng `code`** (mock lần 2 throw
  `invalid_grant` giống Google thật) — xác nhận nhánh xử lý không hiển thị "thất bại" nếu đã phát hiện
  session hợp lệ tồn tại.

## Phạm vi KHÔNG làm

- Không đổi cách đổi `code` lấy token (`googleClient.getToken`) — đây là hành vi chuẩn OAuth, `code`
  chỉ dùng được 1 lần theo thiết kế của Google, không phải bug ở phía mình.
- Không cố loại bỏ hoàn toàn khả năng race (không thực tế với HTTP) — chỉ cần xử lý ĐÚNG khi nó xảy ra
  thay vì hiển thị lỗi sai.

Xem báo cáo gốc: [docs/todo/B96-oauth-callback-not-idempotent-duplicate-request.md](../todo/B96-oauth-callback-not-idempotent-duplicate-request.md).
