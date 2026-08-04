# Phần B #34. Chấp nhận/từ chối yêu cầu cộng giờ không kiểm tra tư cách người chơi

**Nguồn:** security review toàn bộ codebase — recheck (2026-08-03)


34. ~~**Chấp nhận/từ chối yêu cầu cộng giờ không kiểm tra tư cách người chơi**~~
    **✅ ĐÃ XONG (2026-08-04)** — thêm đúng kiểm tra
    `const player = room.gameState.players.find(p => p.userId === user.userId); if (!player) { socket.emit('game:error', { message: 'Bạn không phải người chơi.' }); return; }`
    vào đầu `game:time_accept` (`server/socket/handlers/GameHandler.js`) và
    `game:time_decline`, trước logic kiểm `room._timeRequestPending`, theo
    đúng pattern có sẵn của `game:request_time` như `instruction.md` §B34
    chỉ định. Giữ nguyên ở tầng handler (không chuyển state
    `_timeRequestPending` sang `GameEngine`), khớp lý do đã nêu trong §B34
    (state này thuộc `room`, không phải `GameEngine`).
    Test: file mới `server/tests/GameHandler.test.js` (4 case) — khán giả
    (`userId` không nằm trong `engine.players`) phát `game:time_accept`/
    `game:time_decline` khi có `_timeRequestPending` đang chờ, assert bị từ
    chối đúng thông báo và request không bị xoá/tiêu thụ; kèm 2 case đối
    chứng xác nhận người chơi thật (đối thủ) vẫn accept/decline được bình
    thường. Mutation-check: revert riêng `GameHandler.js` → cả 2 case
    spectator đỏ đúng dự kiến → khôi phục → xanh lại. `npm test`: 365/365
    xanh (+4 case). Chi tiết: `docs/fix-log.md`.
