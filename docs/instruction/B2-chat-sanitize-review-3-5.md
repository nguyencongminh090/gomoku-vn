# B2. Chat sanitize (review 3.5)

### B2. Chat sanitize (review 3.5)

- Sửa: **escape thực thể** (`&lt;`, `&gt;`), không phải thêm rule regex khác để
  bắt thẻ không đóng — reviewer đánh giá cách vá đúng là đổi hẳn chiến lược
  (escape) chứ không phải vá thêm cho quy tắc "strip" cũ.
- Đây là phòng thủ chiều sâu — reviewer xác nhận **không có XSS đang mở** hôm
  nay (consumer dùng `textContent`). Không cần coi đây là khẩn cấp.
