# #121 — Đổi tên phòng mặc định "Phòng của ..." sang "#<roomID>"

**Trạng thái:** chưa làm

## Nguồn

Báo cáo người dùng — "Scope: Room. Replace room name (default): 'phòng của ...' -> ID (#...)"
(2026-08-14). Người dùng chốt định dạng khi được hỏi: **`#<roomID>`, không có chữ "Phòng"**.

## Mô tả

Khi tạo phòng mà không đặt tên tuỳ chỉnh, tên phòng mặc định hiện là `Phòng của <displayName của
host>`. Yêu cầu đổi mặc định này thành `#<roomID>` (ví dụ `#A3F`) — bỏ hẳn chữ "Phòng" và tên host,
dùng thẳng mã phòng ngắn đã có sẵn.

## Vị trí cần sửa (đã xác nhận qua đọc code, chưa sửa)

`server/managers/RoomManager.js:129-130`, trong `createRoom()`:

```js
const roomId = this._generateRoomId();
const roomName = settings.roomName ? settings.roomName.slice(0, 30) : `Phòng của ${userInfo.displayName}`;
```

`roomId` đã là mã ngắn 3 ký tự (`_generateRoomId()`, dòng 734-736 — bảng chữ
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, bỏ `I,O,0,1` để tránh nhầm lẫn), sinh **trước** dòng tính
`roomName` trong cùng hàm — nên default mới chỉ cần dùng lại biến `roomId` đã có, không cần sinh gì
thêm:

```js
const roomName = settings.roomName ? settings.roomName.slice(0, 30) : `#${roomId}`;
```

## Vì sao chưa sửa ngay

Người dùng chọn "File to TODO" khi được hỏi lựa chọn giữa 2 định dạng đề xuất (2026-08-14), tự chốt
định dạng chính xác thay vì chọn 1 trong 2 gợi ý.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Mức độ:** thấp — đổi 1 giá trị chuỗi mặc định, không đụng logic tạo/tham gia phòng, không đụng
  `roomId` (định danh thật, dùng để route/join) — chỉ đổi `roomName` (nhãn hiển thị).
- **Chỗ cần rà trước khi sửa:** `roomName` hiển thị ở `client/js/lobby.js:260,304`
  (`room-row__name`) và các nơi client khác hiển thị tên phòng (room header, tab title nếu có) —
  đảm bảo `#A3F` hiển thị gọn, không bị cắt/escape sai (đã qua `escapeHtml()` ở lobby.js:260 nên `#`
  không có rủi ro XSS).
- **Không đổi** hành vi khi người dùng **có** đặt tên tuỳ chỉnh (`settings.roomName` không rỗng) —
  chỉ đổi nhánh mặc định.
- Chi tiết cách làm: [docs/instruction/B121-doi-ten-phong-mac-dinh-sang-id-phong.md](../instruction/B121-doi-ten-phong-mac-dinh-sang-id-phong.md).

## Trạng thái test

Chưa viết — chưa sửa. Khi sửa: có test infra server-side (`server/tests/RoomManager.test.js` đã
test `createRoom`) — nên thêm 1 test case xác nhận `roomName` mặc định (không truyền
`settings.roomName`) đúng bằng `#${room.roomId}`, theo rule "Bug-fix workflow" trong `CLAUDE.md`.
