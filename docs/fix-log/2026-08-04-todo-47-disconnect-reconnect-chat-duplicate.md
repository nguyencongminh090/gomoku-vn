# Fix log entry — 2026-08-04 16:10

## Prompt

TODO.md #47 (phát hiện phụ khi làm follow-up #45, không có instruction.md tương ứng): khi mất kết nối/kết nối lại giữa ván, có 2 cơ chế độc lập cùng hiện thông báo trong khung chat cho cùng 1 sự kiện — server emit `chat:message` (`isSystem: true`, code `PLAYER_DISCONNECTED_GRACE`/`PLAYER_RECONNECTED_RESUMED`) VÀ client's `game:interrupted`/`game:resumed` handler tự gọi `ChatUI.appendSystemMessage(t(...))` — cùng nội dung, dịch độc lập ở 2 phía.

## Action

Đọc code xác nhận trùng lặp thật (không chỉ trên lý thuyết): [server/socket/handlers/DisconnectHandler.js](server/socket/handlers/DisconnectHandler.js) `startDisconnectGrace()`/`cancelDisconnectGrace()` emit cả `game:interrupted`/`game:resumed` (dùng bởi client để cập nhật `gameState.status` + `GameUI.updateBoardState()`) LẪN `chat:message` riêng; [client/js/room-socket.js](client/js/room-socket.js) L381-389's `game:interrupted`/`game:resumed` handler tự gọi `ChatUI.appendSystemMessage()` (dịch qua `room.disconnected`/`room.reconnected`, có sẵn cả 2 ngôn ngữ trong `i18n.js`) — handler chung `chat:message` (L141-143) cũng render mọi message nhận được, nên message server gửi vẫn lên khung chat lần nữa.

Áp dụng giải pháp 1 trong 2 đề xuất ở TODO #47: bỏ 2 lệnh `io.to(roomId).emit('chat:message', ...)` phía server ứng với `PLAYER_DISCONNECTED_GRACE` (trong `startDisconnectGrace`) và `PLAYER_RECONNECTED_RESUMED` (trong `cancelDisconnectGrace`, nhánh resume-ngay) — giữ nguyên `game:interrupted`/`game:resumed` emit vì client cần chúng để cập nhật board state, và giữ nguyên client-side `appendSystemMessage` vì nó còn kèm `showToast()` (không có ở đường `chat:message` thuần). Không đụng đến 2 chat message khác không có tương ứng phía client: `PLAYER_RECONNECTED_WAITING` (khi người còn lại vẫn đang trong grace) và `PLAYER_DISCONNECT_TIMEOUT` (huỷ ván) — chỉ 2 message này không trùng.

## Decision

Chọn xoá phía server (không phải xoá client-side dịch) vì: (1) rủi ro thấp hơn — chỉ xoá 2 lệnh emit, không đổi payload/behavior của `game:interrupted`/`game:resumed` mà chỗ khác có thể đang phụ thuộc; (2) giữ được `showToast()` hiện có ở client cho 2 sự kiện này, còn nếu xoá client-side thì mất toast (chat:message thuần không kèm toast); (3) không cần audit thêm chỗ nào khác dùng `game:interrupted`/`game:resumed` để đảm bảo không phá custom UI ngoài chat — 2 event đó không đổi field, chỉ bớt 1 side-effect (emit chat message) không còn cần thiết.

## Summary output

Sửa [server/socket/handlers/DisconnectHandler.js](server/socket/handlers/DisconnectHandler.js): xoá 2 khối `chat:message` emit trùng, thêm comment giải thích tại sao (trỏ tới TODO #47 và client-side handler tương ứng). Cập nhật 2 test trong [server/tests/DisconnectHandler.test.js](server/tests/DisconnectHandler.test.js) đổi từ assert message *có mặt* với code cụ thể sang assert message đó *không còn* được emit (giữ nguyên format `docs/todo/*`, không xoá case cũ theo rule "never discard a test case" — sửa assertion để phản ánh hành vi mới, coverage cho grace/resume flow vẫn nguyên). `npm test`: 501/501 xanh, không hồi quy. Chưa verify bằng browser thật (Playwright) — theo rule DB thật trong CLAUDE.md, việc dựng server thật cho e2e cần di dời `server/db/gomoku.db` trước, ngoài phạm vi fix này; xác nhận qua đọc code + unit test là đủ cho thay đổi thuần loại-bỏ side-effect trùng lặp này.
