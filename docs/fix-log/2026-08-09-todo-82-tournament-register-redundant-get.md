# Fix log entry — 2026-08-09 10:04

## Prompt

TODO.md #82 (điều tra qua `docs/tournament-navigation-latency-report.md`
mục 3.2, 2026-08-09): đăng ký/hủy đăng ký giải đấu bắn thêm 1 round-trip
`tournament:get` thừa.

## Action

Xác nhận qua đọc code trực tiếp (`TournamentHandler.js:271-310`): cả 2
nhánh success của `tournament:register` (dòng 289) và `tournament:unregister`
(dòng 308) đều tự gọi `broadcastTournamentDetail(io, result.tournament)`
ngay sau khi thao tác thành công, gửi `tournament:updated` (đầy đủ dữ liệu
mới nhất) tới room `tournament:<id>` mà client đang ở trong.

`client/js/tournament-detail.js:163-164` (trước fix) vẫn chủ động emit lại
`tournament:get` mỗi khi nhận `tournament:registered`/`tournament:unregistered`
(ack riêng cho đúng socket vừa thao tác), tạo thêm 1 round-trip mạng hoàn
toàn thừa vì `tournament:updated` đã đủ để `renderAll()` (qua listener
`tournament:updated` đã có sẵn) phản ánh đúng trạng thái mới.

Fix: xoá 2 dòng listener thừa đó. Không đổi listener `tournament:updated`
chính, không đổi lần gọi `tournament:get` ban đầu khi load trang.

Bumped shared cache-bust version `?v=91 → ?v=92` across every
`client/*.html` and every `?v=` import in `client/js/*.js`; verified with
`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` showing a
single `?v=92` value.

## Decision

Không viết Jest unit test — đây là thay đổi thuần `client/js/`, khu vực này
hiện chưa có test runner tự động (theo `CLAUDE.md`). Không đổi cơ chế
debounce broadcast (thuộc #83, mục riêng), không đổi lần gọi `tournament:get`
khi load trang lần đầu — đúng phạm vi trong `instruction.md` #82.

## Summary output

`npm test`: 39 suites / 948 tests passed (không có test nào bị ảnh hưởng,
đây là thay đổi client-only).

Xác nhận tĩnh: cả 2 nhánh success của `tournament:register`/`unregister`
trong `TournamentHandler.js` đều gọi `broadcastTournamentDetail` (dòng 289,
308) — không có nhánh nào bỏ sót `tournament:updated`. Version-bump grep
xác nhận đúng 1 giá trị `?v=92` trên toàn bộ file non-mockup.
