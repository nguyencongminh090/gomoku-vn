# Phần B #29. Trần >6000 người vẫn chưa quy được nguyên nhân — sau khi sửa backlog,

**Nguồn:** truy nguyên trần kết nối (2026-08-02, xem `docs/stress-test-report.md` §10)


29. **Trần >6000 người vẫn chưa quy được nguyên nhân** — sau khi sửa backlog,
    ở 6000 người: **0** `ListenOverflows` (hàng đợi accept đã hết tràn hoàn
    toàn) nhưng tỉ lệ thành công vẫn ~75%, CPU server chỉ ~26%. Tăng số tiến
    trình sinh tải (8 → 16) **không cải thiện**, nên không phải chỉ do số
    tiến trình harness. Nghi phạm còn lại chưa tách bạch được: đường handshake
    engine.io đơn luồng, `jwt.verify` mỗi kết nối trên main thread, hoặc chính
    khả năng mở 6000 socket dồn dập của máy chạy test. **Chưa sửa gì** — giữ
    đúng quy tắc "tái hiện → đo → mới sửa", ghi lại là chưa giải thích được
    thay vì đoán.

    **🟡 ĐÃ ĐIỀU TRA TIẾP + SỬA MỘT PHẦN (2026-08-02, phiên sau)** — chạy lại
    đúng `scripts/capacity-test/` ở 6000 người trong phiên làm việc này (cùng
    hình dạng máy 8 core/Node v22 như báo cáo gốc, nhưng là một sandbox khác —
    số tuyệt đối không so trực tiếp được với báo cáo gốc, nhưng phương pháp và
    kết luận định tính thì có giá trị). Tái hiện được trần: 6000 người → 72-78%
    thành công, toàn bộ lỗi là `connect timeout`.
    - **`jwt.verify` — LOẠI TRỪ.** Chạy lại đúng burst 6000 người trên server
      có `jwt.verify` bị thay bằng decode không kiểm chữ ký (`--require`
      preload, không đụng file gốc) → tỉ lệ thành công gần như y hệt (77.5% so
      với 77-78% bản gốc). Không phải nghi phạm.
    - **Tìm được nguyên nhân thật, đã sửa:** lấy `--cpu-prof` thật của server
      đúng lúc burst thất bại, thấy `getOnlineUsersList()`/broadcast
      `lobby:online_users` (`server/socket/SocketHandler.js`) nằm trong top
      self-time. Hàm này quét + sort **toàn bộ** session đang kết nối (O(n))
      và bắn lại cho cả phòng lobby — nhưng lại chạy trên **MỖI LẦN** connect
      và disconnect riêng lẻ, tức là O(n) chạy lặp lại n lần trong 1 đợt burst
      n người = **O(n²)** tổng cộng. Xác nhận bằng thực nghiệm nhân-quả (không
      chỉ suy đoán từ tương quan): tắt tạm 2 điểm gọi này (bản nháp, không
      commit) → tỉ lệ thành công ở đúng 6000 người tăng từ baseline 72-78% lên
      83-86%.
    - **Đã sửa thật (xem `docs/fix-log.md` 2026-08-02 22:41):** debounce
      broadcast `lobby:online_users` 300ms, dùng đúng pattern
      `broadcastLobbyUpdate()` đã có sẵn trong `state.js` (per-`io` WeakMap
      timer). `npm test`: 299/299 xanh, mutation-check xanh.
    - **Chưa đóng mục này** — sau khi sửa, 6000 người vẫn chỉ 73-86% (3 lần
      chạy), cải thiện thật nhưng chưa hết. Còn lại, đo được nhưng CHƯA sửa:
      (a) fine-grained CPU sampling (5 mẫu/giây qua `/proc/PID/stat`, chính
      xác hơn nhiều so với `%CPU` kiểu trung bình trượt của `ps` mà báo cáo gốc
      dùng để ra con số "~26%") cho thấy CPU server thật ra **vọt tới
      100-190%** của 1 core trong đúng khung burst — tức là con số "~26%,
      không phải nghẽn CPU" của báo cáo gốc **rất có thể là artefact của cách
      đo thô** (1 mẫu/giây bằng `ps`), không phải kết luận đúng; (b) profile
      cũng lộ ra ~10% thời gian nằm trong transaction SQLite đồng bộ của
      `saveGame()` — nhưng đây là chi phí phụ thuộc hình dạng workload của
      chính harness (mọi phòng test đều kết thúc bằng `room:leave` giữa ván
      → coi là đầu hàng, gọi `saveGame()`), **chưa xác nhận** đây là chi phí
      chung của traffic thật, nên **chưa sửa**. Đúng quy tắc "tái hiện → đo →
      mới sửa": chỉ sửa phần đã xác nhận nhân-quả (broadcast O(n²)), phần còn
      lại ghi lại là chưa isolate xong (cần profiling sâu hơn — flame graph —
      ngoài phạm vi phiên này) thay vì đoán và sửa theo suy đoán.
