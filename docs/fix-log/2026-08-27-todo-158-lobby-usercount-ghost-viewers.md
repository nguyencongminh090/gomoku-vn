# Fix log entry — 2026-08-27 16:09

## Prompt

"Do #158"

## Action

TODO.md #158: thẻ phòng ở sảnh hiển thị `userCount` cao hơn thực tế vì
`RoomManager.listRooms()` dùng `room.users.size` — đếm luôn viewer (`slot === null`)
đã mất kết nối, những người này không có timeout dọn dẹp (chốt #115) nên nằm trong
`room.users` vô thời hạn khi phòng còn người khác giữ sống.

Đã hỏi người dùng công thức đếm (instruction B158): chọn **(A)** — chỉ loại viewer
`slot === null && presence === 'disconnected'`; seated player mang `disconnected`
tạm thời trong grace vẫn được tính (đang cố quay lại).

Sửa tại `RoomManager.listRooms()` (`server/managers/RoomManager.js`): thay
`userCount: room.users.size` bằng vòng lặp bỏ qua đúng lớp viewer-ma đó. Không đụng
`room.users`/`userRoomMap`/logic reconnect (#115), không đổi `serializeRoom`.

5 test mới trong `server/tests/RoomManager.test.js` (describe "listRooms userCount vs.
ghost viewers"): all-active đếm đủ; viewer disconnected bị loại; viewer `away` vẫn tính;
seated player disconnected vẫn tính (grace); nhiều viewer-ma đều bị loại.

## Decision

- Công thức (A) chứ không (B): quyết định của người dùng qua AskUserQuestion.
- Branch off `main`: `git show main:TODO.md | grep '#158'` có kết quả, và
  `listRooms()` là code cũ trên `main` — không phải code chỉ-có-trên-dev.
- Không đụng `client/` ⇒ không bump `?v=N`.

## Summary output

`npm test` 1367/1367. Mutation-kill thủ công: tắt dòng `if (u.slot === null && ...)
continue;` → 2/5 test mới fail (viewer disconnected, multiple ghost viewers), phần còn
lại giữ xanh vì chúng khẳng định "vẫn phải đếm". `fix/lobby-usercount-exclude-ghost-viewers`
off `main`.
