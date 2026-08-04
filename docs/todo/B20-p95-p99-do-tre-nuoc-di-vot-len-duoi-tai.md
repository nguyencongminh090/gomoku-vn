# Phần B #20. p95/p99 độ trễ nước đi vọt lên dưới tải

**Nguồn:** stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)


20. ~~**p95/p99 độ trễ nước đi vọt lên dưới tải**~~
    **✅ ĐÃ ĐO PHẦN GC (2026-08-02), LOẠI ĐƯỢC GC** — chạy lại server với cờ
    `--trace-gc` (chỉ là flag chẩn đoán, không đổi code), lặp lại đúng kịch bản
    2000 người gây p95/p99 cao trước đó, rồi đối chiếu log GC với đúng khung
    giờ burst chạy (11-30 giây sau khi server khởi động). Trong khung đó: 66
    lần GC (đều là Scavenge trẻ + 1 Mark-Compact), **pause dài nhất chỉ
    3.92ms**, tổng cộng dồn **98.26ms GC trong suốt 19 giây burst**. 2 lần
    Mark-Compact "nặng" hơn (10-12ms) trong log đều xảy ra **sau khi burst đã
    xong** (dọn rác sau khi client đóng kết nối hàng loạt), không trùng khung
    giờ đo latency.
    **Kết luận: GC không giải thích được đuôi 70-143ms đã quan sát** — pause
    GC lớn nhất trong khung đo chưa tới 4ms. Đuôi latency nhiều khả năng vẫn là
    hệ quả của cùng nguyên nhân đã nêu ở mục 19 (cộng dồn lưu lượng trong
    harness), không phải GC. **Chưa đo được phần "chi phí fan-out" (mục 22) và
    "burst harness" tách biệt hoàn toàn khỏi GC** — 2 khả năng còn lại đã có dữ
    liệu ở mục 22 và Phần A #7 tương ứng.
