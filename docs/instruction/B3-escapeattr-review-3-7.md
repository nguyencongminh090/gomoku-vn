# B3. `escapeAttr` (review 3.7)

### B3. `escapeAttr` (review 3.7)

- Hiện **an toàn** vì input chỉ là `roomId`/`userId` do server sinh. Sửa vì
  phòng ngừa tương lai — reviewer cảnh báo cụ thể: nếu sau này ai tái dùng hàm
  này cho `roomName`/`displayName` (dữ liệu người dùng nhập) mà chưa sửa, lỗ
  hổng mới thành thật. Không cần gấp nhưng nên sửa trước khi `escapeAttr` được
  dùng cho input tự do.
