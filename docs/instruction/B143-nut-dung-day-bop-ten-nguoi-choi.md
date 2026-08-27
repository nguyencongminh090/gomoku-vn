# B143 — Nút `✕` bóp tên ở ghế của chính mình

## Ràng buộc

- `min-width: 32px; min-height: 32px` trên `.slot-card__stand` là **ngưỡng vùng chạm** cho mobile.
  Nếu hạ, phải kiểm chứng lại bằng chạm thật trên viewport điện thoại, đừng chỉ đo trên desktop.
- Tuyệt đối **không** gỡ `minmax(0, 1fr)` của #142 để "trả lại chỗ cho tên" — đó là thứ giữ cho rail
  không bị đẩy ra ngoài; nới nó là tái phát #142.
- Giữ `overflow/text-overflow: ellipsis` làm phương án dự phòng dù chọn hướng nào: tên tối đa 24 ký
  tự vẫn có thể dài hơn thẻ ở viewport hẹp.

## Đo

So bề rộng khả dụng của `.slot-card__name` ở ghế **có** nút `✕` và ghế **không** có, trên ít nhất 2
viewport (1920 và ~1280). Mục tiêu là hai ghế đọc được xấp xỉ nhau, không phải ghế của mình tệ hơn.
