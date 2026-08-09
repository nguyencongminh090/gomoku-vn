# Phần B #82. Đăng ký/hủy đăng ký giải đấu bắn thêm 1 round-trip `tournament:get` thừa

**Nguồn:** báo cáo người dùng — "moving in tournament (navigate, comein/out...) sometimes slow" (2026-08-09), điều tra qua [docs/tournament-navigation-latency-report.md](../tournament-navigation-latency-report.md) mục 3.2.

## Vấn đề đã xác nhận (đọc code qua CodeGraph, không suy đoán)

`client/js/tournament-detail.js:163-164`:
```js
client.on('tournament:registered', () => client.emit('tournament:get', { tournamentId }));
client.on('tournament:unregistered', () => client.emit('tournament:get', { tournamentId }));
```

Nhưng server (`server/socket/handlers/TournamentHandler.js:271-310`, xử lý
`tournament:register`/`tournament:unregister`) **đã tự** gọi
`broadcastTournamentDetail(io, result.tournament)` ngay sau khi thao tác
thành công — payload này (`tournament:updated`) đã đầy đủ dữ liệu tournament
mới nhất, gửi tới đúng room `tournament:<id>` mà client vừa join/vẫn còn
trong đó.

Client vẫn chủ động bắn thêm 1 `tournament:get` — **round-trip thừa hoàn
toàn** — khiến UI phải chờ thêm 1 lượt đi-về mạng nữa mới "ổn định" sau khi
bấm join/leave, dù dữ liệu cần thiết đã tới trước đó qua `tournament:updated`.
Trên latency mạng cao (điện thoại, mạng di động, hoặc qua Cloudflare Tunnel),
khoản round-trip thừa này cộng dồn trực tiếp vào cảm giác "lag" khi come
in/out mà báo cáo gốc mô tả.

## Việc cần làm

Xem hướng dẫn chi tiết: [docs/instruction/B82-tournament-register-thua-round-trip-tournament-get.md](../instruction/B82-tournament-register-thua-round-trip-tournament-get.md).

## Trạng thái

✅ ĐÃ XONG (2026-08-09, `fix/tournament-register-redundant-get`). Xoá 2
dòng listener thừa ở `client/js/tournament-detail.js:163-164`
(`tournament:registered`/`tournament:unregistered` → `tournament:get`).
Xác nhận cả 2 nhánh success của `tournament:register`/`unregister` trong
`TournamentHandler.js` (dòng 289, 308) đều tự gọi `broadcastTournamentDetail`
nên `tournament:updated` luôn đến, không cần round-trip thêm. `npm test`:
39 suites / 948 tests passed. Chi tiết: [docs/fix-log/2026-08-09-todo-82-tournament-register-redundant-get.md](../fix-log/2026-08-09-todo-82-tournament-register-redundant-get.md).
