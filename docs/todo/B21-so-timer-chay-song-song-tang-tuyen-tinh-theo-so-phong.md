# Phần B #21. Số timer chạy song song tăng tuyến tính theo số phòng

**Nguồn:** stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)


21. ~~**Số timer chạy song song tăng tuyến tính theo số phòng**~~
    **✅ ĐÃ ĐO (2026-08-02), CHI PHÍ KHÔNG ĐÁNG KỂ** — dựng 784 ván thật đang
    sống song song (784 interval 1s của `TimerManager`, `timerMode: per_move`
    nên interval phải làm việc thật mỗi tick, không phải nhàn rỗi), rồi để
    **hoàn toàn im lặng** (không nước đi, không traffic gì) trong 12 giây, đo
    CPU server mỗi giây. **CPU giữ nguyên ~7.0-7.2% suốt 12 giây** — chỉ cao
    hơn baseline lúc chưa dựng ván (~5.7%) đúng 1.3-1.5 điểm phần trăm, cho
    784 timer cùng chạy. **Kết luận: chi phí interval-mỗi-phòng không đáng kể
    ở quy mô đã đo (tới ~800 phòng).** Không cần gộp về 1 interval chung —
    hướng đó (đã nêu trong mô tả gốc) **không nên làm** vì chưa có bằng chứng
    cần, đúng tinh thần "đừng sửa khi chưa đo được là nó đắt".
