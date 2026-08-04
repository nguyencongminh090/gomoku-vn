# B10. `timer:tick` → `deadline` (review 4.3)

### B10. `timer:tick` → `deadline` (review 4.3)

- Sửa: gửi `{deadline}` **1 lần/lượt**, client tự đếm ngược — reviewer không
  yêu cầu gửi kèm thời gian server để đồng bộ đồng hồ (đó là rủi ro agent tự
  thêm vào khi đánh giá an toàn, xem `TODO.md` B10, không phải yêu cầu gốc của
  reviewer — nhưng nên cân nhắc vì review không đo case lệch giờ client).
