# B34. Kiểm tra tư cách người chơi khi chấp nhận/từ chối yêu cầu cộng giờ (từ recheck security review, 2026-08-03)

### B34. Kiểm tra tư cách người chơi khi chấp nhận/từ chối yêu cầu cộng giờ (từ recheck security review, 2026-08-03)

- Cùng đợt recheck với B33, cùng mức độ nghiêm trọng (CONFIRMED, confidence
  8/10) — khán giả trong phòng có thể cấp giờ không giới hạn cho một người
  chơi thay đối thủ thật, vô hiệu hoá cơ chế chống câu giờ.
- **Sửa đúng bằng cách tái dùng pattern có sẵn ngay trong cùng file** —
  `game:request_time` (`server/socket/handlers/GameHandler.js`, ~dòng
  281-285) đã có đúng kiểm tra
  `engine.players.find(p => p.userId === user.userId)`. Copy đúng kiểm tra
  đó vào đầu `game:time_accept` (~dòng 335) và `game:time_decline`
  (~dòng 372), trước logic kiểm `room._timeRequestPending.from`.
- **Khác B33 ở chỗ:** đây nằm ở tầng handler (`GameHandler.js`), không phải
  tầng `GameEngine` — vì `_timeRequestPending` là state của `room`, không
  phải state của `GameEngine`; giữ nguyên vị trí kiểm tra ở handler cho nhất
  quán với `game:request_time` đã có, không chuyển state này vào
  `GameEngine` chỉ để làm cho giống B33.
- Không đổi tên sự kiện lỗi (`game:error`) hay format `{ message }` — dùng
  đúng convention đang có ở `game:request_time` khi từ chối.
- Test: thêm case vào file test của `GameHandler`/socket handlers hiện có,
  dựng kịch bản: 1 "khán giả" (không nằm trong `engine.players`) phát
  `game:time_accept`/`game:time_decline` khi có `_timeRequestPending` đang
  chờ, assert bị từ chối và **không** cộng giờ / không xoá pending request.
  Mutation-check: gỡ kiểm tra mới, xác nhận test đỏ.
