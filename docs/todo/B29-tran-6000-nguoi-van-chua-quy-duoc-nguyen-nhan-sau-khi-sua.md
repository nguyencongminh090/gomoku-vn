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

    **🟡 ĐIỀU TRA TIẾP (2026-08-04, phiên sau TODO #41)** — chạy lại
    `scripts/capacity-test/` ở 6000 và 8000 người trên **cùng máy/sandbox**
    đang dùng cho phiên làm việc hôm nay (khác máy/sandbox so với 2 lần đo
    trước — số tuyệt đối không so trực tiếp được, nhưng phương pháp/kết luận
    định tính có giá trị). Real db được di chuyển ra ngoài trước khi chạy,
    khôi phục + verify checksum sau (đúng rule Playwright/e2e trong
    `CLAUDE.md`, áp dụng tương tự cho harness này vì nó cũng chạy
    `server/index.js` thật và gọi `saveGame()`).
    - **Phát hiện phương pháp quan trọng: `--cpu-prof` tự nó là một phần
      nhiễu, không chỉ là công cụ đo.** Chạy đúng burst 6000 người
      (`--rooms=3000 --workers=16`) 2 lần với cấu hình mã nguồn giống hệt
      nhau (debounce 300ms và 1500ms) nhưng **không** bật `--cpu-prof`: cả 2
      lần đều ra **100%** thành công (0-3 lỗi lẻ tẻ, không phải connect
      timeout hàng loạt). Cùng kịch bản đó **có** bật `--cpu-prof`: tụt còn
      **97.6%** (71 connect timeout). Tức là chính việc bật profiler trong
      tiến trình (V8 sampling profiler) tạo ra một phần đáng kể của tỉ lệ lỗi
      từng đo được — số "73-86%" ghi ở trên (phiên 2026-08-02) **nhiều khả
      năng gộp cả nhiễu này**, vì phiên đó lấy `--cpu-prof` cùng lúc với đo
      tỉ lệ thành công, không tách 2 việc ra làm 2 lần chạy riêng. Đây là
      thực nghiệm nhân-quả thật (bật/tắt 1 biến, giữ nguyên mọi thứ khác),
      không phải suy luận.
    - **Ở 6000 người, không bật profiler: 100% sạch, lặp lại 2 lần trên 2
      cấu hình debounce khác nhau.** Với mã nguồn hiện tại (sau backlog fix +
      TODO #41 hôm nay), trần "6000" cũ **không tái hiện được** ở điều kiện
      đo sạch (không profiler). Đổi giá trị `ONLINE_USERS_DEBOUNCE_MS` giữa
      300ms/1500ms **không tạo khác biệt** ở 6000 người trong phiên này (cả 2
      đều ~100%) — tức là **không có bằng chứng nhân-quả** rằng riêng việc
      nới debounce hôm nay (#41) là nguyên nhân đóng được mục #29; nhiều khả
      năng là cộng dồn của các fix trước đó (backlog + debounce 300ms có sẵn
      từ 2026-08-02) đã đủ, và/hoặc điều kiện máy/tải nền hôm nay khác đi.
    - **Trần thật hiện tại nằm quanh ~8000, không phải 6000.** Đẩy tải lên
      8000 người (`--rooms=4000 --workers=16`), không bật profiler: **81.5%**
      và **85.3%** ở 2 lần chạy liên tiếp (740 rồi 590 `connect timeout`) —
      lặp lại được, không phải nhiễu 1 lần. CPU đo bằng sampler ngoài tiến
      trình (`/proc/PID/stat`, 5 mẫu/giây, không đụng vào tiến trình đang đo
      nên không có nhiễu kiểu `--cpu-prof`) đỉnh **~241%** của 1 core — dưới
      xa mức bão hoà 800% của máy 8 core, khớp với khung "nghẽn đường
      single-thread (engine.io handshake / main thread), không phải bão hoà
      CPU toàn máy" mà báo cáo gốc đã nêu làm giả thuyết.
    - **Vẫn CHƯA quy được nguyên nhân cụ thể ở mức ~8000** — phiên này không
      đủ thời gian chạy `--cpu-prof` ở đúng điểm 8000 (vì đã xác nhận
      `--cpu-prof` tự nó làm sai lệch số đo thành công/thất bại, nên cần một
      phương pháp profiling không xâm lấn tiến trình, vd. `perf record` ở
      mức OS hoặc `0x`, ngoài phạm vi công cụ có sẵn trong repo) để tách bạch
      đúng hàm nào chiếm dụng single-thread ở ngưỡng đó. Nghi phạm cũ vẫn còn
      nguyên (đường handshake engine.io đơn luồng, `jwt.verify` mỗi kết nối)
      — `jwt.verify` đã bị loại trừ ở phiên 2026-08-02 cho kịch bản 6000,
      chưa re-test riêng cho 8000.
    - **Kết luận cho mục #29:** KHÔNG đóng mục này — nguyên nhân gốc ở ngưỡng
      cao (nay là ~8000, không còn 6000) vẫn chưa được quy kết. Nhưng thực tế
      vận hành đã thay đổi đáng kể: **ở quy mô 6000 người dùng đồng thời kết
      nối mới trong cùng 1 khung thời gian ngắn — kịch bản pessimistic nhất
      mà báo cáo gốc dùng để đo — hệ thống hiện tại đạt ~100% thành công**
      trong điều kiện đo sạch, thay vì 72-86% như trước. Không có thay đổi mã
      nguồn nào được thực hiện trong phiên này ngoài dọn dẹp môi trường test
      (đúng rule "tái hiện → đo → mới sửa": chưa xác nhận nhân-quả ở mức 8000
      thì chưa sửa gì).
