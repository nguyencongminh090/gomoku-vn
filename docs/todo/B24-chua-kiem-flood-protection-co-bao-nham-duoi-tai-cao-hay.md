# Phần B #24. Chưa kiểm flood protection có báo nhầm dưới tải cao hay không

**Nguồn:** stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)


24. ~~**Chưa kiểm flood protection có báo nhầm dưới tải cao hay không**~~
    **✅ ĐÃ LÀM (2026-08-02), KHÔNG THẤY BÁO NHẦM** — làm chung với TEST-MATRIX
    row 23 đúng như đề xuất, ra thành test thật `e2e/flood-protection.spec.ts`
    (2 case, chạy `npx playwright test e2e/flood-protection.spec.ts
    --project=chromium` xanh 2 lần liên tiếp, kể cả khi 2 case chạy song song
    2 worker).
    - **Case dương (row 23):** 1 socket bắn liên tục ~200 event/s (gấp 4 lần
      ngưỡng 50) → nhận đúng nhiều cảnh báo `room:error`, rồi bị
      `socket.disconnect(true)` sau đúng `FLOOD_DISCONNECT_STREAK=5` cửa sổ vi
      phạm liên tiếp (khớp code, không sai lệch số cửa sổ).
    - **Case âm (B24):** 300 socket đồng thời, mỗi socket giữ nhịp 40 event/s
      (dưới ngưỡng 50), tổng toàn server = 12 000 event/s → **0 cảnh báo oan, 0
      bị ngắt oan**. Đo tay thêm ở mức khắc nghiệt hơn (500 socket × 45/s = 22
      500 event/s, sát ngưỡng 50 hơn) vẫn **0 báo nhầm**.
    - **Kết luận: thiết kế đếm theo closure-riêng-từng-socket (không có bộ đếm
      dùng chung) chịu được tải tổng cao mà không báo nhầm, kể cả khi timer
      1s/socket có thể bị trễ dưới áp lực event loop.** Không cần sửa gì.
    - **Lưu ý trung thực (2026-08-02, phát hiện khi làm B19-B22 ngay sau đó):**
      chạy lại `e2e/flood-protection.spec.ts` để double-check sau 1 phiên tải
      nặng khác (B19-B22, dựng/huỷ 784+ ván) trên **cùng 1 tiến trình server**
      → case âm **fail đúng 1 lần** (`falseDisconnects` > 0). Restart server
      sạch rồi chạy lại **10/10 lần liên tiếp đều xanh**; chạy thêm 4 lần ngay
      sau lần fail (chưa restart) cũng xanh cả 4. Tổng: **14/15 lần xanh**, 1
      lần fail xảy ra ngay sau khi tiến trình server vừa xử lý xong một đợt
      tải nặng không liên quan. **Chưa đủ bằng chứng để coi đây là bug thật**
      (không lặp lại được khi thử lại có chủ đích), nhưng cũng chưa loại trừ
      hẳn được khả năng dồn GC/event-loop từ đợt tải trước đó làm 1 cửa sổ bị
      trễ thật. Nếu `e2e/flood-protection.spec.ts` fail lại trong CI hay lần
      chạy sau, đừng coi là flaky-test-nên-retry — đối chiếu xem ngay trước đó
      server có vừa xử lý tải nặng khác không trước khi kết luận.
      Chi tiết đầy đủ: `docs/stress-test-report.md` (đoạn bổ sung).
