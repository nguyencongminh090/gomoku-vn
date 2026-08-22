# #150 — Tin nhắn chat gửi trong lúc một người rớt mạng bị **mất hẳn** với người đó

**Trạng thái:** chưa làm.

**Nguồn:** phát hiện khi điều tra #147 (2026-08-22). Không phải người dùng báo — không có báo cáo
nào về triệu chứng này; đây là khoảng trống tìm thấy khi đối chiếu xem
`connectionStateRecovery` của socket.io sẽ **thêm** được gì mà app chưa có.

## Vấn đề

`server/socket/handlers/ChatHandler.js` chỉ **phát** tin nhắn đi (`io.to(roomId).emit('chat:message', …)`)
— không lưu gì lại. Grep xác nhận: không có `chatHistory`, không có mảng `messages`, không có bảng
SQLite nào cho chat.

`RoomManager.serializeRoom()` (`server/managers/RoomManager.js:684`) trả về `roomId`, `roomName`,
`hostId`, `hostName`, `users`, `state`, `readyDeadline`, `readyMissCount`, `settings`, `scoreTable`
— **không có chat**.

⇒ Khi một người chơi rớt mạng và kết nối lại, `room:joined` dựng lại đầy đủ room + game + timer, còn
mọi tin nhắn gửi trong khoảng thời gian đó thì **không bao giờ đến được họ**. Không có lỗi, không có
log, không có dấu hiệu gì trên UI — cuộc trò chuyện đơn giản là có một lỗ hổng mà chỉ người bị rớt
mới thấy.

Bối cảnh khiến điều này không hiếm: **#131 đã đo được ~17% mất gói** ở hop 8 của nhà mạng (`mtr`),
tức rớt kết nối ngắn là chuyện thường xảy ra chứ không phải ngoại lệ.

## Việc cần làm (đề xuất, chưa chốt)

Giữ **N tin nhắn gần nhất mỗi phòng** trong bộ nhớ (cùng nơi với `room`, không cần SQLite — chat
không cần sống qua restart), rồi gửi kèm trong payload `room:joined`.

Đây là hướng người dùng đã chọn khi đóng #147: giải quyết **trực tiếp** vấn đề thật, không đụng gì
tới tầng socket.io.

## Vì sao KHÔNG dùng `connectionStateRecovery` để vá cái này

Xem `docs/todo/B147-chua-bat-connectionstaterecovery.md` phần "Điều tra 2026-08-22". Tóm tắt: nó vá
được cái này như một tác dụng phụ, nhưng đổi lại phải chạm vào auth middleware, single-device
eviction, và 3 loại grace period — không cân xứng với một vấn đề nằm gọn trong `ChatHandler`. Người
dùng đã chốt đóng #147 vì đúng lý do này.

## Câu hỏi cần chốt trước khi làm

- **N bằng bao nhiêu?** Đủ để che một lần rớt mạng (vài chục giây), không phải "lịch sử chat" đầy đủ.
- **Người mới vào phòng có thấy chat cũ không?** Đây là câu hỏi về **quyền riêng tư/sản phẩm**, không
  phải kỹ thuật: `room:joined` dùng chung cho cả người *quay lại* lẫn người *vào lần đầu*. Gửi buffer
  cho cả hai là để người lạ đọc được cuộc trò chuyện trước khi họ vào. Có thể cần phân biệt hai
  trường hợp (đã có sẵn cờ `handshake.auth.reconnect` và nhánh `existingRoom` để phân biệt).
- **Chat của phòng giải đấu** (`tournament-match`) có dùng chung đường này không — cần kiểm, đừng
  giả định.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa đo)

- **Hiệu quả:** vá một lỗ hổng UX thật nhưng **âm thầm** — không ai báo cáo vì không có triệu chứng
  nhìn thấy được. Giá trị phụ thuộc vào việc người chơi có thực sự dùng chat nhiều hay không; **nên
  hỏi người dùng trước khi làm** thay vì giả định là đáng.
- **An toàn:** rủi ro thấp về kỹ thuật (thêm một mảng có giới hạn vào state của room). Rủi ro thật
  nằm ở câu hỏi quyền riêng tư phía trên — làm sai thì thành rò rỉ nội dung chat cho người lạ.
- **Test:** `server/tests/` có hạ tầng thật ⇒ bắt buộc. Phải phủ: buffer không vượt quá N; người
  *quay lại* nhận được tin bị lỡ; và (tuỳ quyết định ở trên) người *vào lần đầu* nhận đúng cái được
  phép nhận.
