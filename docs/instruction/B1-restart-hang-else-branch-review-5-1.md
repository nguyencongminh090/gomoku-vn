# B1. Restart-hang else branch (review 5.1)

### B1. Restart-hang else branch (review 5.1)

- Chỉ cần emit `room:destroyed`/`room:left` trong nhánh else — reviewer không
  yêu cầu logic phức tạp hơn (không cần lưu state phòng ra đĩa, không cần giữ
  ván qua restart — đó là thay đổi kiến trúc lớn hơn nhiều, ngoài phạm vi việc
  này).
