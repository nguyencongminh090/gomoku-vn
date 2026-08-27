# B150 — Buffer chat gửi kèm `room:joined`

## Hỏi trước khi làm: cái này có đáng làm không?

Không ai báo cáo triệu chứng này — nó được tìm thấy khi điều tra #147, không phải từ người dùng thật.
Trước khi viết code, **hỏi người dùng** liệu chat trong phòng có được dùng đủ nhiều để đáng vá. Một
tính năng không ai thiếu là chi phí bảo trì thuần tuý.

## Ranh giới quan trọng nhất: `room:joined` phục vụ HAI loại người

`SocketHandler.js` gửi `room:joined` ở nhánh `existingRoom` cho **người quay lại**, nhưng
`RoomHandler`/`LobbyHandler` cũng gửi cùng event đó cho **người vào phòng lần đầu**. Nhét buffer chat
vào payload một cách vô điều kiện = cho người lạ đọc cuộc trò chuyện diễn ra trước khi họ vào phòng.

Đó là quyết định **sản phẩm/quyền riêng tư**, không phải kỹ thuật ⇒ chốt với người dùng, đừng tự chọn.
Công cụ để phân biệt đã có sẵn: cờ `socket.handshake.auth.reconnect` và bản thân nhánh `existingRoom`.

## Đừng đụng

- **`serializeRoom()` / `serializeRoomUpdate()`**: `serializeRoomUpdate` cố ý **bỏ** `settings` để
  tiết kiệm băng thông (đo được: 163 B trong payload 2073 B, nhân theo bình phương số người trong
  phòng). Đừng nhét chat vào `serializeRoom` — `room:updated` bắn rất thường xuyên (sit/stand/ready/
  join/leave/kick/game-end) và sẽ kéo theo cả buffer chat mỗi lần. Chat chỉ đi kèm `room:joined`.
- **Không lưu chat xuống SQLite.** Nó không cần sống qua restart; thêm bảng là thêm nghĩa vụ (sweep,
  migration, quyền riêng tư) cho một buffer vài chục tin.
- **Giới hạn N phải cứng**, ép ở chỗ ghi (`push` rồi cắt), không phải chỗ đọc. Một mảng không giới
  hạn trong state của room là rò rỉ bộ nhớ theo thời gian sống của phòng.

## Kiểm trước, đừng giả định

Chat của phòng giải đấu (`tournament-match`) có đi qua cùng `ChatHandler` và cùng `room:joined`
không? Grep, đừng đoán — nếu nó có đường riêng thì phạm vi mục này rộng gấp đôi so với mô tả.

## Test (bắt buộc — `server/tests/` có hạ tầng thật)

Theo "Writing comprehensive test cases" của `CLAUDE.md` — đây là logic có ngưỡng (N) nên cần phân
tích giá trị biên:

- Buffer đúng N khi có N, N-1, N+1 tin nhắn (biên).
- Người **quay lại** nhận được tin gửi trong lúc họ mất kết nối.
- Người **vào lần đầu** nhận đúng cái đã chốt ở phần quyền riêng tư phía trên — case này tồn tại dù
  quyết định là "có" hay "không", chỉ khác kỳ vọng.
- Phòng bị huỷ ⇒ buffer đi theo, không còn tham chiếu nào giữ nó lại.
