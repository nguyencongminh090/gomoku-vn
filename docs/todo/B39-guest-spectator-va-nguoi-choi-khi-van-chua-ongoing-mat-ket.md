# Phần B #39. Guest/spectator (và người chơi khi ván chưa `ongoing`) mất kết nối bị

**Nguồn:** báo cáo người dùng — "Reconnect Logic is not very well" (2026-08-04)


39. ~~**Guest/spectator (và người chơi khi ván chưa `ongoing`) mất kết nối bị
    đuổi khỏi phòng ngay lập tức, không có grace period — khác hẳn với
    người chơi đang trong ván đang chạy.**~~
    **✅ ĐÃ XONG (2026-08-04)** — thêm `SPECTATOR_GRACE_MS = 30s` (mặc định,
    override qua env), `spectatorGraceTimers` map riêng trong `state.js`, và
    `startSpectatorGrace()`/`cancelSpectatorGrace()` trong
    `DisconnectHandler.js` — cùng khuôn mẫu `startEmptyRoomGrace`. Xem chi
    tiết đầy đủ trong `docs/fix-log.md` (dòng `2026-08-04 04:56`).
    Test: describe block mới "spectator grace period" (6 case) trong
    `DisconnectHandler.test.js`, `npm test` 385/385 xanh. Mutation-check: 7/25
    đỏ khi revert. **Đã kiểm bằng server thật + `socket.io-client` thật**
    (không chỉ unit test): reconnect trong grace nhận đúng `room:joined`,
    reconnect sau khi hết grace nhận đúng `room:destroyed`.

    ~~Đọc kỹ `instruction.md` §39
    trước khi làm — có 2 nhánh grace hiện có (`startDisconnectGrace` chỉ áp
    dụng khi `gameState.status === 'ongoing'` và user là player;
    `startEmptyRoomGrace` chỉ áp dụng khi user là **người duy nhất** còn lại
    trong phòng) và một khoảng trống ở giữa 2 nhánh đó chưa được xử lý.~~
    - **Triệu chứng:** một guest xem ván đấu (hoặc 1 player đã ngồi ghế
      nhưng ván chưa bắt đầu) rớt mạng thoáng qua (khoá màn hình điện thoại,
      wifi chập chờn) trong khi còn người khác ở lại phòng →
      `handleDisconnect` (`server/socket/handlers/DisconnectHandler.js:36`)
      rơi thẳng xuống `finalizeNormalLeave` → bị xoá khỏi `room.users`/
      `userRoomMap` ngay lập tức, không có cửa sổ chờ nào.
    - Khi socket tự động reconnect (socket.io `reconnection: true`), do
      user đã bị xoá khỏi phòng, `SocketHandler.js:144`
      (`roomManager.getRoomByUser`) trả về `null` → rơi vào nhánh
      `socket.handshake.auth.reconnect === true`
      (`SocketHandler.js:160-176`) → server emit `room:destroyed` với
      thông báo **"Phòng không còn tồn tại"** — sai sự thật, vì phòng vẫn
      còn người khác ở trong đó. Người dùng bị đá về sảnh chờ kèm thông
      báo gây hiểu lầm, thay vì được nối lại vào phòng như player đang
      trong ván vẫn được.
    - **Đánh giá hiệu quả/an toàn:** an toàn để sửa — chỉ mở rộng phạm vi
      grace period đã có sẵn (không đổi cơ chế), rủi ro thấp; hiệu quả cao
      vì đây là trải nghiệm người dùng gặp thường xuyên hơn ca "player mất
      kết nối giữa ván" (guest/spectator đông hơn, mạng di động chập chờn
      phổ biến).
    - **Trạng thái:** mới phát hiện, ghi lại phân tích — Sequence UML
      (mermaid) đã vẽ, chưa sửa code.
    - **Test dự kiến:** Jest trong `server/tests/DisconnectHandler.test.js`
      (đã có `twoPlayerRoom` fixture) — case guest rớt mạng trong phòng có
      ≥2 người, ván chưa `ongoing`, xác nhận có grace period thay vì bị xoá
      ngay theo rule "Bug-fix workflow" + "Viết test case toàn diện" trong
      `CLAUDE.md`.
