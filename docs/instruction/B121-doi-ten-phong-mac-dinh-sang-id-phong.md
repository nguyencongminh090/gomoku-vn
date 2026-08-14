# B121 — Đổi tên phòng mặc định sang "#<roomID>"

Hướng dẫn thực thi cho TODO.md #121 (đã làm — `fix/room-default-name-id` off `main`, 2026-08-14).

## Định dạng đã chốt với người dùng

`#<roomID>` — **không** có chữ "Phòng", không có tên host. Ví dụ: `#A3F`.

## Cách đã làm

- Sửa `server/managers/RoomManager.js:130`, trong `createRoom()`:
  ```js
  const roomName = settings.roomName ? settings.roomName.slice(0, 30) : `#${roomId}`;
  ```
  `roomId` được sinh ở dòng 129 ngay phía trên (`this._generateRoomId()`) — tái dùng biến có sẵn,
  không sinh thêm giá trị mới, không đổi `_generateRoomId()`.
- Chỉ đổi nhánh mặc định (khi `settings.roomName` rỗng/không truyền) — nhánh người dùng tự đặt tên
  (`settings.roomName.slice(0, 30)`) giữ nguyên không đổi.
- Không đổi `roomId` hay cách sinh mã phòng — vẫn là định danh thật dùng để route/join/broadcast;
  chỉ đổi `roomName`, là nhãn hiển thị lưu riêng trong object `room`.
- Đã rà `client/js/lobby.js:260,304` (`room-row__name` trong danh sách phòng ở lobby) — hiển thị
  qua `escapeHtml()` sẵn, không cần sửa gì thêm cho định dạng mới.

## Phạm vi KHÔNG làm (giữ đúng như đã lên kế hoạch)

- Không đổi bảng chữ cái hay độ dài mã phòng (`_generateRoomId()`, dòng 734-736).
- Không đổi giới hạn 30 ký tự (`slice(0, 30)`) của tên tuỳ chỉnh.
- Không đụng logic tham gia phòng bằng `roomId` — thay đổi này thuần về nhãn hiển thị.

## Test đã viết

`server/tests/RoomManager.test.js`, describe block mới `'RoomManager — default room name'`:
- Không truyền `roomName` → assert `result.room.roomName === '#' + result.room.roomId`.
- Truyền `{ roomName: 'Tên tuỳ chỉnh' }` → assert giữ nguyên (regression check cho nhánh không đổi).

`npm test`: 1136/1136 pass.

Xem thêm: [docs/todo/B121-doi-ten-phong-mac-dinh-sang-id-phong.md](../todo/B121-doi-ten-phong-mac-dinh-sang-id-phong.md).
