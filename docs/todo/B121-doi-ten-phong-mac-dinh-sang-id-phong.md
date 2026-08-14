# #121 — Đổi tên phòng mặc định "Phòng của ..." sang "#<roomID>"

**Trạng thái:** ✅ Đã sửa.

## Nguồn

Báo cáo người dùng — "Scope: Room. Replace room name (default): 'phòng của ...' -> ID (#...)"
(2026-08-14). Người dùng chốt định dạng khi được hỏi: **`#<roomID>`, không có chữ "Phòng"**.

## Mô tả

Khi tạo phòng mà không đặt tên tuỳ chỉnh, tên phòng mặc định trước đây là `Phòng của <displayName
của host>`. Yêu cầu đổi mặc định này thành `#<roomID>` (ví dụ `#A3F`) — bỏ hẳn chữ "Phòng" và tên
host, dùng thẳng mã phòng ngắn đã có sẵn.

## Sửa đã áp dụng (2026-08-14, `fix/room-default-name-id` off `main`)

`server/managers/RoomManager.js:130`, trong `createRoom()`:

```js
const roomId = this._generateRoomId();
const roomName = settings.roomName ? settings.roomName.slice(0, 30) : `#${roomId}`;
```

Tái dùng thẳng biến `roomId` đã sinh ở dòng trên (`_generateRoomId()`, mã ngắn 3 ký tự, bảng chữ
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, bỏ `I,O,0,1`) — không sinh thêm giá trị mới, không đổi
`_generateRoomId()`. Nhánh người dùng tự đặt tên (`settings.roomName.slice(0, 30)`) giữ nguyên
không đổi.

Đã rà `client/js/lobby.js:260,304` (`room-row__name`, hiển thị `roomName` trong danh sách phòng ở
lobby, đã qua `escapeHtml()`) và không có nơi client nào khác cần sửa riêng — `roomName` chỉ được
đọc, không có logic phụ thuộc vào định dạng cũ.

## Đánh giá hiệu quả / an toàn

**Mức độ rủi ro thấp:** đổi 1 giá trị chuỗi mặc định, không đụng `roomId` (định danh thật dùng để
route/join/broadcast) hay logic tạo/tham gia phòng nào khác — chỉ đổi `roomName` (nhãn hiển thị).
`#A3F` không có ký tự cần escape đặc biệt ngoài những gì `escapeHtml()` đã xử lý sẵn ở
`lobby.js:260`.

## Trạng thái unit test

`server/tests/RoomManager.test.js`, describe block mới `'RoomManager — default room name'` (2 test):
- `with no custom roomName, the default is "#<roomId>", not the host name` — assert
  `room.roomName === '#' + room.roomId`.
- `a custom roomName is kept as-is, not overridden by the default` — regression check cho nhánh
  không đổi.

`npm test`: 1136/1136 pass (bao gồm 2 test mới, suite `RoomManager.test.js` 52/52).

Xem thêm: [docs/instruction/B121-doi-ten-phong-mac-dinh-sang-id-phong.md](../instruction/B121-doi-ten-phong-mac-dinh-sang-id-phong.md).
