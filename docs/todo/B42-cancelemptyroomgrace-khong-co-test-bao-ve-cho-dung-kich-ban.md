# Phần B #42. `cancelEmptyRoomGrace` không có test bảo vệ cho đúng kịch bản mutation

**Nguồn:** `gomoku-vn-review(1).md` vòng 3, mục 12.5 (kiểm chứng 2026-08-02)


42. ~~**`cancelEmptyRoomGrace` không có test bảo vệ cho đúng kịch bản mutation
    mà review nêu**~~
    **✅ ĐÃ XONG (2026-08-04)** — mutation-check xác nhận test cũ (TODO #18,
    `server/tests/DisconnectHandler.test.js:294`) KHÔNG bắt được mutation mà
    review mô tả: nó gọi thẳng `DisconnectHandler.cancelEmptyRoomGrace()` như
    một hàm thuần, bỏ qua hẳn call site thật trong `SocketHandler.js:137` —
    đúng nơi review nhắm tới khi nói "gỡ hẳn lệnh gọi". Thêm test case mới
    trong `server/tests/SocketHandler.test.js` (describe "connection with no
    surviving room (restart-hang)") assert `cancelEmptyRoomGrace`/
    `cancelSpectatorGrace` được gọi đúng `user.userId` trên mọi connection,
    và chạy trước `getRoomByUser` (`mock.invocationCallOrder`). Không sửa
    logic thật (`startEmptyRoomGrace`/`cancelEmptyRoomGrace` không đổi, đúng
    ranh giới `instruction.md` §42 — chỉ thêm test). Xem chi tiết đầy đủ
    trong `docs/fix-log.md` (dòng `2026-08-04 08:06`).
    Test: `npm test` 394/394 xanh (+1 so với baseline 393). Mutation-check:
    comment tạm dòng gọi thật trong `SocketHandler.js` → test mới đỏ đúng
    kỳ vọng (`Expected: "u1", Number of calls: 0`); khôi phục → xanh lại,
    `git diff` trên `SocketHandler.js` rỗng.

    - **Ở đâu:** `server/socket/handlers/DisconnectHandler.js:148-155`.
    - **Vì sao:** bản thân grace (`startEmptyRoomGrace`) có test, nhưng phần
      **huỷ** grace (`cancelEmptyRoomGrace`) không có test độc lập bảo vệ.
    - **Bằng chứng review đã đo:** gỡ `cancelEmptyRoomGrace` ra khỏi bản copy
      → `359 passed, 359 total`, không test nào đỏ. Kiểm chứng hành vi thật
      bằng 2 bản build: bản gốc (vào lại OK trong 20s → phòng còn); bản gỡ
      cancel (vào lại OK trong 20s → qua mốc 20s → **phòng bị xoá dù user
      đang online**).
    - **Lưu ý:** TODO #18 (vòng 2, thêm `EMPTY_ROOM_GRACE_MS`) đã có test
      "cancel qua reconnect thì không gọi `leaveRoom`" — cần xác nhận lại
      test đó có thực sự bắt được đúng mutation "gỡ hẳn lệnh gọi
      `cancelEmptyRoomGrace`" mà review mô tả hay không trước khi coi mục
      này là đã đóng.
    - **Đánh giá hiệu quả/an toàn:** rất rẻ — chỉ cần 1 test case dựng đúng
      kịch bản "gỡ cancel → user online vẫn bị đá ra khi hết grace", theo
      đúng rule "Viết test case toàn diện" trong `CLAUDE.md`.
    - **Test dự kiến:** thêm case vào `server/tests/DisconnectHandler.test.js`
      dựng đúng kịch bản trên; mutation-check bằng cách gỡ tạm lệnh gọi
      `cancelEmptyRoomGrace` trên bản copy, xác nhận test mới đỏ, rồi khôi
      phục.
