# B141 — e2e flaky: đua `?id=` + hai giới hạn per-IP

## Tách bạch hai phần

Phần 1 (đua `?id=`) là **bug thật của spec**, sửa được ngay, một dòng, không cần hỏi.
Phần 2 (giới hạn per-IP) **không phải bug** — là biện pháp chống lạm dụng có chủ đích. Đừng "sửa"
bằng cách nới ngưỡng mặc định; chốt với người dùng cách làm trước khi đụng vào.

## Bẫy

- **Đừng đổi `waitForURL` thành `waitForTimeout`** — che cuộc đua chứ không loại bỏ nó, và làm mọi
  lần chạy chậm thêm.
- Khi một spec e2e fail, **kiểm tra hạn mức trước khi kết luận hồi quy**: khởi động lại server (store
  của `authLimiter` nằm trong bộ nhớ) rồi chạy lại **riêng** spec đó. Fail "guest auth should
  succeed" hoặc `#room-id-nav` không tìm thấy gần như luôn là hạn mức, không phải code.
- Nếu nới `authLimiter` qua env: giữ mặc định **20/15 phút** y nguyên khi biến không được đặt, và
  đừng để giá trị env đọc được ở production build mà không ai để ý.

## Không đụng

- Ngưỡng mặc định `MAX_ROOMS_PER_IP = 3` và `authLimiter` 20/15 phút (`docs/todo/B07-*.md`).
- `keyGenerator` của `authLimiter` (bọc `ipKeyGenerator`, chống xoay IPv6 trong cùng /56).
