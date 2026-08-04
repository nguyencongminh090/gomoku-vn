# A4. Đo lại timing attack sau khi áp Phần B #6

### A4. Đo lại timing attack sau khi áp Phần B #6

Sau khi thêm dummy-compare (Phần B #6), phải đo lại **thời gian phản hồi thật**
(không chỉ tính đối xứng code path) trên máy có bcrypt hoạt động được — máy
đánh giá gốc không load được bcrypt nên chưa có số đo trước/sau để so sánh.
