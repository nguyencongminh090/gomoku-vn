# B158 — `userCount` ở sảnh đếm luôn viewer-ma

Hướng dẫn thực thi cho TODO.md #158 (chưa làm).

## Cách tiếp cận khi làm

- **Hỏi người dùng trước khi chọn công thức đếm** — không tự quyết. Hai lựa chọn khác nhau về ý
  nghĩa:
  - (A) Chỉ loại viewer (`slot === null`) có `presence === 'disconnected'` — giữ nguyên player đang
    trong grace (họ vẫn coi là "còn trong phòng", đang cố quay lại).
  - (B) Loại mọi user có `presence === 'disconnected'` bất kể `slot` — đơn giản hơn nhưng đổi cả ý
    nghĩa đếm khi phòng đang `interrupted`/trong `startSpectatorGrace`.
- Sửa tại `RoomManager.listRooms()` (`server/managers/RoomManager.js:614-638`), đổi dòng
  `userCount: room.users.size` thành đếm có điều kiện theo lựa chọn đã chốt với người dùng.
- Cần thêm test cho `server/tests/RoomManager.test.js` (đã có test cho `listRooms()`/`userCount`
  theo ghi chú blast-radius — kiểm tra file test hiện tại trước khi viết, tránh trùng case) — theo
  quy tắc bắt buộc viết unit test khi vùng code đã có test infra (CLAUDE.md "Bug-fix workflow").

## Phạm vi KHÔNG làm

- Không đụng `room.users`/`userRoomMap`/logic reconnect (#115) — chỉ đổi công thức đếm hiển thị.
- Không gộp chung với B157 trong cùng 1 branch trừ khi người dùng yêu cầu — hai fix ở hai tầng khác
  nhau (client hiển thị vs. server tính toán), có thể tách branch độc lập theo `git-workflow`.

Xem báo cáo gốc:
[docs/todo/B158-loi-phong-o-sanh-dem-ca-viewer-ma.md](../todo/B158-loi-phong-o-sanh-dem-ca-viewer-ma.md).
