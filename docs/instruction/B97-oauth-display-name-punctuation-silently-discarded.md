# B97 — Tên hiển thị Google có dấu câu bị âm thầm thay bằng tên khách ngẫu nhiên

Hướng dẫn thực thi cho TODO.md #97 (chưa làm — chỉ ghi lại khi phát hiện qua `/code-review`).

## Cách tiếp cận khi làm

- **Đọc kỹ `isValidDisplayName()` (`server/routes/auth.js:141`) và MỌI nơi gọi nó trước khi đổi** —
  hàm này có thể đang dùng chung cho cả luồng đăng ký username/password thường lẫn OAuth; đổi hành vi
  (strip ký tự thay vì từ chối toàn bộ) chỉ nên áp dụng cho nhánh OAuth nếu 2 luồng cần khác nhau, hoặc
  áp dụng chung nếu hợp lý cho cả 2 — cân nhắc kỹ trước khi quyết định.
- **Hướng fix gợi ý:** viết 1 hàm `sanitizeDisplayName(name)` riêng cho nhánh OAuth — loại bỏ đúng tập
  ký tự `<>&"'` và ký tự điều khiển khỏi `payload.name`, trim khoảng trắng thừa, rồi mới validate độ
  dài còn lại; nếu sau khi strip vẫn rỗng/quá ngắn mới rơi về `generateGuestName()`. KHÔNG đổi
  `isValidDisplayName()` gốc nếu nó vẫn cần giữ nguyên nghĩa "từ chối cứng" ở nơi khác (vd. validate
  input người dùng tự gõ, nơi strip âm thầm có thể gây khó hiểu hơn từ chối rõ ràng).
- **Viết test với tên chứa từng loại ký tự bị chặn riêng** (`O'Brien`, `Marks & Co`, tên có `"`) xác
  nhận phần tên còn lại sau strip được giữ lại đúng, không rơi về tên ngẫu nhiên nếu không cần thiết.

## Phạm vi KHÔNG làm

- Không nới lỏng `isValidDisplayName()` để CHO PHÉP nguyên `<>&"'` đi thẳng vào DB/hiển thị UI — vẫn
  phải strip/escape, không được bỏ qua lý do bảo mật ban đầu của hàm này.
- Không đổi cách sinh tên khách (`generateGuestName()`) — vẫn giữ làm fallback cho trường hợp tên rỗng
  hoàn toàn sau khi strip.

Xem báo cáo gốc: [docs/todo/B97-oauth-display-name-punctuation-silently-discarded.md](../todo/B97-oauth-display-name-punctuation-silently-discarded.md).
