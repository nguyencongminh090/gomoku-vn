# Phần B #43. Grace 20s + hạn mức 3 phòng/IP khoá nhầm người dùng chung IP

**Nguồn:** `gomoku-vn-review(1).md` vòng 3, mục 12.5 (kiểm chứng 2026-08-02)


43. ~~**Grace 20s + hạn mức 3 phòng/IP khoá nhầm người dùng chung IP**~~
    **✅ ĐÃ XONG (2026-08-04)** — người dùng chọn hướng (b): thêm
    `MAX_GRACE_ROOMS_PER_IP=3` (mặc định, override qua env,
    [server/config.js](server/config.js)). `RoomManager.createRoom()`
    ([server/managers/RoomManager.js](server/managers/RoomManager.js)) nhận
    thêm tham số `graceRoomIds` (Set roomId đang trong empty-room-grace, mặc
    định rỗng) — vẫn quét `this.rooms` (không quay lại tally) nhưng tách
    `activeCount` (không tính phòng-đang-grace, so với `MAX_ROOMS_PER_IP`) và
    `graceCount` (chỉ phòng-đang-grace, so với `MAX_GRACE_ROOMS_PER_IP`) —
    chặn riêng nếu 1 trong 2 vượt ngưỡng, đúng ràng buộc "vẫn phải đếm bằng
    cách quét" và "không nhả quota ngay lúc bắt đầu grace" mà
    `instruction.md` §43 nêu. `LobbyHandler.js` build `graceRoomIds` từ
    `emptyRoomGraceTimers` (`state.js`) rồi truyền vào. Xem chi tiết đầy đủ
    trong `docs/fix-log.md` (dòng `2026-08-04 08:16`).
    Test: `npm test` 400/400 xanh (+6). Mutation-check riêng 2 điểm (tách
    active/grace count trong `RoomManager.js`, và truyền `graceRoomIds` ở
    `LobbyHandler.js`) — cả 2 đều đỏ đúng khi gỡ, xanh lại khi khôi phục.
    **Đã kiểm bằng server thật + `socket.io-client` thật** (không chỉ unit
    test, theo đúng rule DB trong `CLAUDE.md` — di chuyển `gomoku.db` sang
    `.pre-verify` trước khi chạy, khôi phục + xác nhận `md5sum` khớp 100%
    sau khi xong): 3 phòng đầu OK, phòng 4 bị từ chối (quota chính); disconnect
    1 phòng (vào grace) → phòng mới lại tạo được (miễn trừ hoạt động);
    disconnect thêm 1 phòng nữa (chạm `MAX_GRACE_ROOMS_PER_IP=2` trong lần
    test này) → phòng tiếp theo bị từ chối đúng thông báo quota-phụ mới,
    không phải quota chính.

    - **Ở đâu:** `server/config.js` — `EMPTY_ROOM_GRACE_MS=20s`,
      `MAX_ROOMS_PER_IP=3`.
    - **Vì sao:** phòng bỏ hoang (chủ phòng rời/rớt mạng) vẫn giữ chỗ trong
      hạn mức `MAX_ROOMS_PER_IP` suốt 20s grace trước khi thực sự bị huỷ.
    - **Bằng chứng review đã đo:** 3 người cùng IP tạo rồi bỏ phòng → người
      thứ 4 (cùng IP) bị từ chối, 22 giây sau mới tạo được. Đúng nhóm bị ảnh
      hưởng mà comment trong `config.js` tự giải thích hạn mức 3 tồn tại VÌ
      (wifi công ty/trường, NAT nhà mạng) — người dùng chung IP hợp lệ bị
      khoá oan bởi chính cơ chế được thêm để bảo vệ họ.
    - **Đánh giá hiệu quả/an toàn:** trung bình — sửa đúng (nhả suất quota
      ngay khi disconnect, chỉ giữ **phòng** sống cho reconnect chứ không giữ
      **quota**) cần tách rõ 2 khái niệm "phòng còn sống" và "phòng tính vào
      quota của IP" hiện đang gộp làm một; cẩn thận để không mở lại đúng lỗ
      hổng mà `MAX_ROOMS_PER_IP` được thêm vào để chặn (1 IP chiếm hết
      `MAX_ROOMS` bằng cách tạo-rồi-bỏ-ngay liên tục).
    - **Test dự kiến:** case trong `server/tests/RoomManager.test.js` —
      chủ phòng rời/disconnect → quota nhả ngay (phòng khác từ cùng IP tạo
      được) trong khi phòng vẫn còn sống cho tới hết grace nếu chủ phòng
      reconnect.
