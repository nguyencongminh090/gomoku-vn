# Phần B #25. Đường từ chối ở cap thật chưa được test dưới burst

**Nguồn:** stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)


25. ~~**Đường từ chối ở cap thật chưa được test dưới burst**~~
    **✅ ĐÃ ĐO (2026-08-02), KHÔNG THẤY LỖI** — chạy đúng ở cap production
    (`MAX_ROOMS_PER_IP = 3`, `MAX_USERS_PER_ROOM = 20`, không nâng gì):
    (A) bắn 15 lệnh `room:create` đồng thời từ cùng 1 IP → đúng **3** thành công,
    12 bị từ chối sạch bằng `room:error` (0 timeout/rơi gói im lặng), và 1 lệnh
    tạo tiếp **sau khi** đợt burst đã lắng vẫn bị từ chối đúng — tức bộ đếm quota
    không bị lệch (không có "ghost room" nào latent làm sai số đếm).
    (B) bắn 40 lệnh `room:join` đồng thời vào **1** phòng (đã có sẵn 1 người) →
    đúng **19** thành công (= `MAX_USERS_PER_ROOM - 1`), 21 bị từ chối sạch bằng
    `room:error`, 0 timeout.
    **Kết luận: cả 2 cap đều đúng thiết kế dưới burst đồng thời, không có race,
    không rò phòng/người.** Không cần sửa gì. Harness:
    `docs/stress-test-report.md` (đoạn bổ sung).
