# A11. `permessage-deflate` (review 8.5, TODO.md #11)

### A11. `permessage-deflate` (review 8.5, TODO.md #11)

- Đây là quyết định cấu hình (bật/tắt nén WebSocket), không phải bug — dự án
  hiện dùng mặc định của engine.io/socket.io mà **chưa ai xác nhận** mặc định
  đó là gì ở runtime thật (giả định tắt, chưa đo).
- Nếu quyết định bật: đo lại băng thông (giảm) và CPU/độ trễ (tăng do nén mỗi
  frame) trên server thật, đối chiếu với các số đã đo ở mục 4 (broadcast) —
  đừng bật rồi bỏ qua, vì review đã cho thấy CPU không phải nút thắt hiện tại
  nhưng nén thêm có thể đổi lại điều đó ở tải cao.
- **Không tự bật** nếu người dùng chưa xác nhận muốn đánh đổi CPU lấy băng
  thông — ghi rõ 2 phương án và số đo dự kiến cần thu thập trước khi hỏi.

---
