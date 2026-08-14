# B121 — Đổi tên phòng mặc định sang "#<roomID>"

Hướng dẫn thực thi cho TODO.md #121 (chưa làm — chỉ ghi lại khi phát hiện, người dùng chọn file
trước thay vì fix ngay, 2026-08-14).

## Định dạng đã chốt với người dùng

`#<roomID>` — **không** có chữ "Phòng", không có tên host. Ví dụ: `#A3F`.

## Cách tiếp cận khi làm

- Sửa đúng `server/managers/RoomManager.js:130`, trong `createRoom()`:
  ```js
  const roomName = settings.roomName ? settings.roomName.slice(0, 30) : `#${roomId}`;
  ```
  `roomId` đã được sinh ở dòng 129 ngay phía trên (`this._generateRoomId()`) — tái dùng biến có sẵn,
  không sinh thêm giá trị mới, không đổi `_generateRoomId()`.
- **Chỉ đổi nhánh mặc định** (khi `settings.roomName` rỗng/không truyền) — nhánh người dùng tự đặt
  tên (`settings.roomName.slice(0, 30)`) giữ nguyên không đổi.
- **Không đổi `roomId` hay cách sinh mã phòng** — đây vẫn là định danh thật dùng để route/join/
  broadcast; chỉ đổi `roomName`, là nhãn hiển thị lưu riêng trong object `room`.
- Rà lại các nơi client hiển thị `roomName` để đảm bảo hiển thị gọn với format mới (ngắn hơn nhiều so
  với "Phòng của <tên dài>"):
  - `client/js/lobby.js:260,304` (`room-row__name` trong danh sách phòng ở lobby)
  - Bất kỳ chỗ nào khác hiển thị `room.roomName` trong `room.html`/`room-ui.js` (title phòng, header)
    — tìm bằng `grep -rn "roomName" client/js/` trước khi sửa để không bỏ sót.
- Không cần đổi CSS/layout — `#A3F` ngắn hơn `Phòng của <tên>` nên không có rủi ro tràn/overflow mới.

## Phạm vi KHÔNG làm

- Không đổi bảng chữ cái hay độ dài mã phòng (`_generateRoomId()`, dòng 734-736).
- Không đổi giới hạn 30 ký tự (`slice(0, 30)`) của tên tuỳ chỉnh.
- Không đụng logic tham gia phòng bằng `roomId` — thay đổi này thuần về nhãn hiển thị.

## Viết test

Có test infra server-side. Thêm 1 test case vào `server/tests/RoomManager.test.js` (cạnh các test
`createRoom` hiện có):
- Gọi `createRoom(userInfo, {})` (không truyền `roomName`) → assert
  `result.room.roomName === '#' + result.room.roomId`.
- Gọi `createRoom(userInfo, { roomName: 'Tên tuỳ chỉnh' })` → assert `roomName` giữ nguyên
  `'Tên tuỳ chỉnh'` (regression check cho nhánh không đổi).

Xem thêm: [docs/todo/B121-doi-ten-phong-mac-dinh-sang-id-phong.md](../todo/B121-doi-ten-phong-mac-dinh-sang-id-phong.md).
