# #158 — Số người trong phòng ở sảnh (`userCount`) đếm luôn viewer-ma đã rời đi từ lâu

**Trạng thái:** ✅ Đã sửa (2026-08-27 — `fix/lobby-usercount-exclude-ghost-viewers` off `main`)

Người dùng chốt công thức **(A)**: `listRooms()` bỏ qua user có `slot === null && presence ===
'disconnected'` khi đếm `userCount`; seated player disconnected (grace) vẫn tính. Sửa vòng lặp thay
`room.users.size` trong `RoomManager.listRooms()`, không đụng `room.users`/`userRoomMap`/reconnect
(#115). 5 test mới trong `server/tests/RoomManager.test.js` (describe "listRooms userCount vs. ghost
viewers"); mutation-kill: tắt dòng lọc → 2/5 fail. `npm test` 1367/1367. Không đụng `client/` ⇒
không bump `?v=N`. Chi tiết:
[docs/fix-log/2026-08-27-todo-158-lobby-usercount-ghost-viewers.md](../fix-log/2026-08-27-todo-158-lobby-usercount-ghost-viewers.md).

**Nguồn:** báo cáo người dùng — cùng nguồn #157 (2026-08-27), phát hiện thêm khi đọc
`RoomManager.listRooms()` trong lúc điều tra #157.

## Vấn đề

`RoomManager.listRooms()` (`server/managers/RoomManager.js:614-638`) tính số người trong phòng cho
thẻ phòng ở sảnh chờ bằng:

```js
userCount: room.users.size,      // Total people in room
```

Vì viewer (`slot === null`) khi mất kết nối không có timeout dọn dẹp (chốt ở `TODO.md #115`, xem
thêm #157) — họ vẫn nằm trong `room.users` **vô thời hạn** cho tới khi phòng tự huỷ (rỗng hoàn
toàn). `room.users.size` vì vậy đếm cả những viewer đã rời đi từ lâu, miễn là phòng còn ít nhất một
người khác giữ nó sống.

## Hậu quả

Thẻ phòng ở sảnh chờ (danh sách phòng công khai) hiển thị số người **cao hơn thực tế** — người dùng
mới thấy phòng "đông" hơn tình trạng thật, có thể ảnh hưởng quyết định vào phòng nào.

## Ngoài phạm vi

Không đụng lại quyết định #115 (không thêm cơ chế dọn viewer-ma khỏi `room.users`). Đây chỉ là một
phép đếm khác đi (loại viewer có `presence === 'disconnected'` ra khỏi `userCount`), không đổi
`room.users` hay hành vi reconnect.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Mức độ:** thấp-trung bình — chỉ sai một con số hiển thị ở sảnh, không ảnh hưởng gameplay.
- **Rủi ro sửa: thấp** — đổi công thức đếm trong `listRooms()`, ví dụ đếm số user có
  `presence !== 'disconnected'` thay vì `room.users.size`. Cần cân nhắc: seated player đang trong
  grace (`interrupted`/`startSpectatorGrace`) cũng mang `presence === 'disconnected'` tạm thời —
  quyết định có nên loại họ khỏi đếm hay không cần bàn với người dùng trước khi làm (khác với viewer
  vĩnh viễn rời đi, player trong grace vẫn đang cố quay lại và có thể muốn tính là "còn trong
  phòng").

Chi tiết hướng làm:
[docs/instruction/B158-loi-phong-o-sanh-dem-ca-viewer-ma.md](../instruction/B158-loi-phong-o-sanh-dem-ca-viewer-ma.md).
