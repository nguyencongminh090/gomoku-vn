# Fix log entry — 2026-08-04 08:06

## Prompt

TODO.md #42 / instruction.md §42 (review 12.5, kiểm chứng 2026-08-02): review nêu `cancelEmptyRoomGrace` không có test độc lập bảo vệ, gỡ hẳn lệnh gọi hàm này ra khỏi bản copy khiến phòng bị xoá sai dù user đang online. Cần xác nhận trước xem case "cancel qua reconnect thì không gọi leaveRoom" đã có trong TODO #18/vòng 2 (`server/tests/DisconnectHandler.test.js:294`) có thật sự bắt được đúng mutation review mô tả hay không, theo hướng dẫn `instruction.md` §42.

## Action

Mutation-check trên bản copy `server/socket/SocketHandler.js`: comment tạm dòng gọi `DisconnectHandler.cancelEmptyRoomGrace(user.userId)` (giữ nguyên hàm `cancelEmptyRoomGrace` trong `DisconnectHandler.js`, không đụng), chạy lại `npm test` → 393/393 vẫn xanh, xác nhận test cũ ở dòng 294 KHÔNG bắt được mutation này (vì nó gọi thẳng `DisconnectHandler.cancelEmptyRoomGrace()` như 1 hàm thuần, bỏ qua hẳn call site thật trong `SocketHandler.js` — nơi review thực sự nhắm tới). Thêm test case mới trong `server/tests/SocketHandler.test.js` (describe "SocketHandler — connection with no surviving room (restart-hang)"): assert `cancelEmptyRoomGrace`/`cancelSpectatorGrace` được gọi đúng `user.userId` trên MỌI connection, và chạy trước `getRoomByUser` (dùng `mock.invocationCallOrder`) — đúng thứ tự comment trong `SocketHandler.js` mô tả. Khôi phục lại dòng gọi đã comment tạm, xác nhận về đúng trạng thái gốc (git diff rỗng).

## Decision

Không đụng logic `startEmptyRoomGrace`/`cancelEmptyRoomGrace` hiện có, đúng ranh giới `instruction.md` §42 chỉ cho phép thêm test — chỉ thêm 1 test case mới trong `SocketHandler.test.js` thay vì sửa lại test cũ trong `DisconnectHandler.test.js` (test cũ đó vẫn đúng cho vai trò của nó — bảo vệ hành vi của hàm `cancelEmptyRoomGrace` khi được gọi trực tiếp — chỉ là không đủ để bắt được mutation ở call site, nên cần test bổ sung riêng thay vì thay thế).

## Summary output

`npm test`: 394/394 xanh (+1 so với baseline 393). Mutation-check xác nhận: bỏ comment tạm dòng gọi trong `SocketHandler.js` → test mới đỏ đúng như kỳ vọng (`Expected: "u1", Number of calls: 0`); khôi phục lại → xanh. Không có commit code thật nào ngoài test mới, vì `cancelEmptyRoomGrace`/call site vốn đã đúng hành vi — mục #42 chỉ thiếu test bảo vệ, nay đã có.
