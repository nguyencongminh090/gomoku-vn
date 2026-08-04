# Phần B #19. `game:init` không tới trong 15s ở tải cao — chưa xác định được nguyên nhân

**Nguồn:** stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)


19. ~~**`game:init` không tới trong 15s ở tải cao — chưa xác định được nguyên nhân**~~
    **✅ ĐÃ ĐO (2026-08-02)** — tách riêng chuỗi bắt tay (không kèm nước đi nào)
    thành 2 đoạn đo từ phía client: A = `room:sit` phát ra → xác nhận cả 2 đã
    ngồi (`room:updated`); C = `room:ready` phát ra → nhận `game:init`. Chạy
    2000 người (1000 cặp) đồng thời, **chỉ riêng bắt tay, không có nước đi nào
    cả**: **0 lỗi**, độ trễ tối đa toàn bộ chuỗi chỉ **122ms** — thấp hơn nhiều
    so với cửa sổ chờ 15 000ms từng gây lỗi trước đó.
    Chạy lại đúng script gốc (có kèm 6 nước đi/cặp, giống bản đo ban đầu) trên
    cùng server vừa khởi động lại: vẫn ra lỗi (6.7% lần này), nhưng **giai đoạn
    bị timeout khác lần trước** — lần này là `room:joined` (bước đầu tiên), lần
    trước là `game:init` (bước cuối). **Giai đoạn lỗi đổi giữa các lần chạy →
    không phải lỗi/race cố định ở một khâu cụ thể trong `room:sit` →
    `syncReadyWindow` → `room:ready` → `startGame`** (loại được giả thuyết (c)).
    **Kết luận: bản thân chuỗi bắt tay của server rất nhanh (≤122ms ở 2000
    người khi đo riêng); độ trễ/lỗi quan sát được trước đây đến từ việc cộng
    dồn lưu lượng nước đi chạy song song trong CHÍNH harness đo (giả thuyết
    (a)/(b)), không phải một lỗi cụ thể trong code bắt tay.** Không cần sửa gì
    ở `room:sit`/`syncReadyWindow`/`room:ready`/`startGame`. Vẫn giữ nguyên đề
    xuất ở Phần A #7 (harness đa tiến trình) nếu muốn đo tiếp con số chính xác.
