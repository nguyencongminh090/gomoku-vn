# B98 — Lỗi "OAuth chưa cấu hình" không nhất quán, thoát khỏi UI lỗi đăng nhập có style

Hướng dẫn thực thi cho TODO.md #98 (chưa làm — chỉ ghi lại khi phát hiện qua `/code-review`).

## Cách tiếp cận khi làm

- **Đưa cả `GET /google` và `GET /google/callback` về cùng 1 kiểu phản hồi khi `!googleClient`** —
  redirect `error=oauth_not_configured` (route callback đã redirect kiểu `error=oauth_state`/
  `oauth_failed` sẵn, chỉ cần thêm biến thể lỗi mới; route `/google` hiện trả JSON trực tiếp, cần đổi
  thành redirect nếu muốn 2 route nhất quán — cân nhắc route `/google` được gọi trực tiếp từ `<a
  href>`, chưa từng ở trang `login.html` nên redirect về `login.html?error=...` vẫn hợp lý).
- **Thêm key i18n riêng** cho `oauth_not_configured`, nội dung khác với `oauth_failed`/`oauth_state`
  (2 lỗi kia ngụ ý "bạn thử lại đi", lỗi này nên ngụ ý "tính năng chưa sẵn sàng, không phải lỗi của
  bạn") — tránh gây hiểu nhầm người dùng tự trách bản thân thao tác sai.
- **Giữ nguyên comment giải thích "cannot be shown inside an AJAX response"** ở đầu file — lý do dùng
  redirect thay vì JSON response vẫn đúng, chỉ cần áp dụng đồng nhất cho cả 2 route.

## Phạm vi KHÔNG làm

- Không đổi hành vi khi `googleClient` tồn tại (cấu hình bình thường) — chỉ sửa nhánh thiếu cấu hình.
- Không thêm cơ chế tự động phát hiện/cảnh báo thiếu env var lúc khởi động (nằm ngoài phạm vi finding
  này, xem thêm mục #2 ở Phần A nếu cần).

Xem báo cáo gốc: [docs/todo/B98-oauth-not-configured-error-inconsistent-ui.md](../todo/B98-oauth-not-configured-error-inconsistent-ui.md).
