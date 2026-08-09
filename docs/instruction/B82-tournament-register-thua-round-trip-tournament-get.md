# B82 — Bỏ round-trip `tournament:get` thừa sau register/unregister (hướng dẫn thực thi)

Nguồn: báo cáo người dùng, TODO.md #82 (2026-08-09).

## Bối cảnh kỹ thuật

`client/js/tournament-detail.js:163-164`:
```js
client.on('tournament:registered', () => client.emit('tournament:get', { tournamentId }));
client.on('tournament:unregistered', () => client.emit('tournament:get', { tournamentId }));
```
Server đã tự gửi `tournament:updated` (đầy đủ dữ liệu mới nhất) ngay sau khi
xử lý `tournament:register`/`tournament:unregister` thành công
(`TournamentHandler.js:271-310`, gọi `broadcastTournamentDetail`). Listener
`tournament:updated` đã có sẵn ở `tournament-detail.js` (xử lý entries
upsert/removed, gọi `renderAll()`).

## Cách làm

Xoá 2 dòng listener thừa ở `tournament-detail.js:163-164`. Không cần thay
thế bằng gì khác — `tournament:updated` (đã đến trước hoặc cùng lúc, do cùng
1 room) đã đủ để `renderAll()` phản ánh đúng trạng thái mới sau khi
đăng ký/hủy đăng ký.

Kiểm tra kỹ 1 điều trước khi xoá: xác nhận `tournament:updated` **luôn** bắn
ra trong mọi nhánh thành công của `tournament:register`/`unregister` (đã xác
nhận đúng ở dòng 289 và 308 của `TournamentHandler.js` — cả 2 nhánh success
đều gọi `broadcastTournamentDetail`), không có nhánh nào bỏ sót.

## Bẫy cụ thể

- Đừng xoá luôn listener `tournament:updated` chính — chỉ xoá 2 dòng phụ
  đang emit lại `tournament:get`.
- Race condition cần để ý: `tournament:registered`/`unregistered` (ack riêng
  cho chính socket vừa thao tác, dòng 288/306) và `tournament:updated`
  (broadcast cho cả room) là 2 sự kiện khác nhau, thứ tự đến không đảm bảo
  tuyệt đối cái nào trước — nhưng cả 2 đều được emit trong cùng 1 tick xử lý
  sự kiện phía server nên trong thực tế luôn tới gần như đồng thời qua cùng
  kết nối. Verify bằng cách bấm đăng ký/hủy đăng ký thật trên browser, xác
  nhận UI cập nhật đúng ngay lần broadcast đầu tiên, không "nhấp nháy" giữa
  trạng thái cũ và mới.

## Không thuộc phạm vi (đừng gộp vào fix này)

- Không đổi cơ chế debounce broadcast (đó là #83, một mục riêng).
- Không đổi `tournament:get` dùng ở nơi khác (ví dụ khi mới load trang lần
  đầu, `client/js/tournament-detail.js` gọi `tournament:get` để lấy dữ liệu
  ban đầu — chỗ đó vẫn cần giữ nguyên, chỉ bỏ 2 lần gọi lại thừa sau khi đã
  có dữ liệu qua broadcast).
