# Phần B #22. Chi phí fan-out của broadcast theo số người trong phòng

**Nguồn:** stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)


22. ~~**Chi phí fan-out của broadcast theo số người trong phòng**~~
    **✅ ĐÃ ĐO (2026-08-02)** — so sánh 2 cách chia **cùng 1000 kết nối**: (a)
    500 phòng × 2 người (0 khán giả) vs (b) 50 phòng × 20 người (2 người chơi +
    18 khán giả, đúng `MAX_USERS_PER_ROOM`).
    - **Trong 1 phòng đã ổn định (đang trao đổi nước đi), độ trễ người chơi
      chính và độ trễ khán giả nhận được gần như giống hệt nhau** (p50=1-2ms cả
      2 phía) — `io.to(roomId).emit()` là 1 lệnh đồng bộ quét hết thành viên
      trong cùng 1 tick, không có độ trễ tăng dần theo từng người nhận ở quy mô
      20 người/phòng.
    - **Nhưng đuôi p95/p99 của kịch bản (b) lại CAO HƨN kịch bản (a) rõ rệt**
      (70/122ms so với 19/24ms) dù (b) có ÍT phòng hơn hẳn (50 so với 500, tức
      ít lệnh `room:create` hơn). Nguyên nhân khoanh vùng được: mỗi phòng ở
      kịch bản (b) có 18 khán giả **join gần như cùng lúc** (`Promise.all`) sau
      khi phòng tạo xong — mỗi lần `room:join` lại phát `room:updated` tới
      **toàn bộ thành viên hiện có**, nên chi phí broadcast trong riêng giai
      đoạn LẤP ĐẦY phòng tăng theo kiểu bậc hai với số người (~1+2+...+19 lần
      gửi mỗi phòng chỉ tính riêng phần join), không phải tuyến tính. Độ trễ đo
      được ở vài nước đi đầu có thể là dư âm của đợt dồn này chưa kịp giải toả.
    **Kết luận: fan-out KHÔNG phải vấn đề ở giai đoạn ổn định (mỗi nước đi khi
    phòng đã đầy), NHƯNG có chi phí thật ở giai đoạn nhiều khán giả cùng ập vào
    1 phòng trong thời gian ngắn.** Nếu muốn tối ưu, hướng đúng là gộp/giảm số
    lần broadcast `room:updated` khi nhiều người join dồn dập (vd. debounce
    ngắn ở phase join, tương tự cách đã làm cho `lobby:update` ở TODO #9) —
    nhưng **chưa đủ bằng chứng để coi đây là ưu tiên sửa ngay**, vì kịch bản
    "18 khán giả join cùng lúc trong <1s vào 1 phòng" hiếm khi xảy ra thật
    ngoài môi trường test tải.

    **✅ ĐÃ SỬA (2026-08-06)** — người dùng chủ động chọn sửa ngay trong lúc rà
    soát hiệu năng broadcast tổng thể (xem `docs/fix-log/2026-08-06-todo-22-room-updated-join-burst-debounce.md`).
    `broadcastRoomUpdate()` giờ debounce theo từng `roomId` (80ms, `state.js`),
    cùng kỹ thuật với `broadcastLobbyUpdate()`/`broadcastOnlineUsers()` nhưng
    scope hẹp hơn (per-room thay vì toàn server). Branch `fix/room-broadcast-join-debounce`
    (off `main`), `npm test`: 508/508.
