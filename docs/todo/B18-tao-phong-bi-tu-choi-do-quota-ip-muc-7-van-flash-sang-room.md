# Phần B #18. Tạo phòng bị từ chối do quota IP (mục 7) vẫn "flash" sang `room.html`

**Nguồn:** báo cáo người dùng khi test thủ công, tái hiện bằng Playwright (2026-08-02)


18. ~~**Tạo phòng bị từ chối do quota IP (mục 7) vẫn "flash" sang `room.html`
    rồi mới đá về lobby, dễ gây cảm giác "bấm Tạo phòng → bị đá về sảnh
    chính"**~~
    **✅ ĐÃ SỬA (2026-08-02)** — không phải lỗi ở quota theo IP (mục 7), quota
    hoạt động đúng thiết kế; vấn đề nằm ở trải nghiệm điều hướng lạc quan phía
    client khi request bị từ chối.
    - **Thử 2 hướng, chọn hướng an toàn hơn sau khi hướng đầu lộ ra lỗi thật:**
      hướng 1 (`submitCreate()` emit `room:create` từ chính trang lobby, chờ
      ack rồi mới điều hướng) đã **implement xong nhưng bị revert** — nó đòi
      hỏi ngắt socket của lobby trước khi socket mới của `room.html` kết nối
      lại, và dưới tải song song thật (nhiều Playwright worker cùng lúc trên
      máy dev) đã đo được khoảng cách ngắt→kết-nối-lại **vượt quá 5s, rồi vượt
      luôn cả 15s** — nghĩa là **bất kỳ** grace period hữu hạn nào cũng có thể
      bị phá vỡ bởi mạng/thiết bị chậm thật, không chỉ máy test. Rủi ro thật:
      phòng vừa tạo tự huỷ ngay dưới mắt người dùng thật trên kết nối chậm.
    - **Hướng 2 (đã chọn, đang dùng):** giữ nguyên kiến trúc điều hướng lạc
      quan cũ (`submitCreate()` vẫn điều hướng sang `room.html` ngay, `room:create`
      vẫn emit từ `processRoomIntent()` sau khi trang mới kết nối — không đổi gì
      ở server, không thêm cơ chế grace mới nào) — chỉ sửa phần **hiển thị**:
      thêm `#room-entry-overlay` (`client/room.html`) hiện mặc định (không cần
      JS bật) che toàn bộ khung phòng trống/chưa init cho tới khi `room:joined`
      thật sự tới (`room-socket.js` `hideEntryOverlay()`). Nếu bị từ chối,
      overlay vẫn che, toast lỗi hiện đè lên (z-index 1200 > 1100), rồi về lại
      `index.html` sau ~1.5s — đúng pattern đã dùng sẵn cho `room:kicked`/
      `room:destroyed`. Không còn thấy UI phòng trống/vỡ, không có cơ chế
      server mới nào để có thể lỗi tinh vi hơn.
    - Kịch bản thực tế dễ đụng ngưỡng 3: người chơi rời phòng nhưng đối thủ
      còn ở lại (`leaveRoom()` chỉ huỷ phòng khi rỗng hoàn toàn) — lặp lại vài
      lần, phòng cũ vẫn "sống" và cộng dồn vào quota của người tạo.
    - **Đã kiểm:** danh sách phòng ở lobby vẫn hiển thị đúng sau khi bị đá về
      — phần "danh sách phòng không load" trong báo cáo gốc **chưa tái hiện
      được**, có thể do độ trễ cảm nhận (1.5s + round-trip subscribe) chứ
      không phải lỗi thật; cần thêm chi tiết cụ thể hơn từ người báo cáo nếu
      vẫn gặp lại.
    - **Test:** `e2e/leave-then-create-room.spec.ts` cập nhật lại theo hành vi
      cuối cùng — assert overlay hiện ngay khi vừa sang `room.html`, toast lỗi
      xuất hiện, rồi bounce về lobby. Chạy PASS ổn định kể cả dưới tải song
      song nặng (`--workers=6`, cùng 3 file spec chạy chung — đúng điều kiện
      từng làm lộ ra lỗi của hướng 1). `npm test`: 289/289 xanh (không đổi số
      lượng test unit vì #18 không cần code phía server).
    - **⚠️ Vòng 2 (2026-08-02, sau khi test thật trên `play3cr.dpdns.org`):**
      người dùng báo cáo **không tạo được phòng nào cả** — log server cho
      thấy `Room #XYT created` → `Disconnected` → `Room #XYT destroyed
      (empty)` gần như cùng giây, lặp lại liên tục cho mỗi lần bấm Tạo phòng.
      Hướng 2 ở trên chỉ sửa phần **hiển thị** (che UI vỡ bằng overlay) chứ
      **không sửa nguyên nhân gốc**: `DisconnectHandler.handleDisconnect()`
      huỷ phòng ngay lập tức khi người dùng còn lại (0 người) — kể cả khi
      chính là do socket vừa ngắt để chuyển trang / kết nối lại chưa kịp, chứ
      không phải bỏ phòng thật. Trên localhost khoảng ngắt→nối lại đủ nhanh để
      không lộ; qua mạng thật (không phải do proxy — người dùng xác nhận vẫn
      là do transition lobby → room bị server xử lý như ngắt kết nối thật) nó
      lộ ra ở **mọi lần**, không chỉ dưới tải nặng giả lập.
      - **Sửa thật lần này:** thêm `EMPTY_ROOM_GRACE_MS` (`server/config.js`,
        mặc định 20s, override qua env) — khi người dùng ngắt kết nối và là
        thành viên duy nhất còn lại trong phòng (không phải do bấm nút "Rời
        phòng" — `room:leave` trong `RoomHandler.js` vẫn huỷ ngay lập tức,
        không đổi), `DisconnectHandler.js` không huỷ phòng ngay mà chờ tối đa
        20s (`startEmptyRoomGrace`/`cancelEmptyRoomGrace`,
        `emptyRoomGraceTimers` trong `state.js`). Nếu cùng userId kết nối lại
        trong lúc chờ, `SocketHandler.js` huỷ timer trước khi chạy logic
        auto-rejoin sẵn có (`getRoomByUser`) — phòng vẫn còn, người dùng được
        đưa thẳng vào phòng như bình thường, không cần đổi gì phía client.
      - Đây là cùng ý tưởng với lần thử đầu (grace period) đã bị revert, khác
        ở chỗ: (1) **không** đổi client sang chờ ack trước khi điều hướng —
        kiến trúc điều hướng lạc quan giữ nguyên, nên không tạo thêm cửa sổ
        rủi ro nào mới so với hiện trạng; (2) grace chỉ áp dụng cho đường
        disconnect ngoài ý muốn, tách biệt hoàn toàn khỏi đường `room:leave`
        chủ động; (3) lần trước bị revert vì lo "bất kỳ timeout hữu hạn nào
        cũng có thể bị phá vỡ" — đúng về mặt lý thuyết, nhưng giờ đã biết rõ
        **hiện trạng không-có-grace mới là thứ luôn hỏng** (100% các lần thử
        tạo phòng thật, không phải lỗi hiếm dưới tải), nên grace hữu hạn là
        cải thiện chắc chắn chứ không phải rủi ro thêm vào một đường vốn đã
        chạy tốt.
      - **Test:** `server/tests/DisconnectHandler.test.js` — thêm describe
        block "empty-room grace period" (5 test: bắt đầu grace thay vì huỷ
        ngay, cancel qua reconnect thì không gọi `leaveRoom`, hết hạn thì huỷ
        thật, disconnect lặp lại không chồng timer, cancel khi không có gì
        đang chờ trả về `false`). Mutation-check: revert riêng
        `DisconnectHandler.js` → cả 5 test fail đúng như kỳ vọng → khôi phục →
        `npm test`: 294/294 xanh.
