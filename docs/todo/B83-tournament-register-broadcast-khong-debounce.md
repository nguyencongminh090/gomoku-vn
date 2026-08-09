# Phần B #83. Broadcast khi đăng ký/hủy đăng ký không debounce — mỗi thao tác bắn 2 broadcast toàn phòng + diff O(n) lặp lại

**Nguồn:** báo cáo người dùng — "moving in tournament (navigate, comein/out...) sometimes slow" (2026-08-09), điều tra qua [docs/tournament-navigation-latency-report.md](../tournament-navigation-latency-report.md) mục 3.3 và 3.6.

## Vấn đề đã xác nhận (đọc code qua CodeGraph, không suy đoán)

Mỗi lần `tournament:register`/`tournament:unregister` xử lý xong
(`server/socket/handlers/TournamentHandler.js:271-310`), cả 2 broadcast này
chạy ngay, không gộp:
```js
broadcastTournamentDetail(io, result.tournament);   // room tournament:<id>
broadcastTournamentListUpdate(io);                  // TOÀN BỘ lobby room
```
Không có cơ chế debounce giống `_queuePairingChanged` (dòng 152-175, dùng
`setImmediate` gom nhiều thay đổi pairing lại thành 1 broadcast). Nếu nhiều
người join/leave gần như đồng thời (điển hình: ngay trước giờ khai mạc), mỗi
người tạo ra 1 cặp broadcast full-payload riêng, gửi liên tiếp tới cả 2 room
— tăng tải serialize + gửi mạng đúng lúc nhiều client khác đang cố tải trang.

Thêm vào đó, `_diffTournamentEntries()` (dòng 107-125) — chạy bên trong
`broadcastTournamentDetail` — `JSON.stringify` **từng entry một** để so sánh
diff mỗi lần gọi. Chi phí O(n) này lặp lại trên mỗi broadcast, cộng dồn với
việc không debounce ở trên sẽ nhân lên khi có burst đăng ký.

## Việc cần làm

Xem hướng dẫn chi tiết: [docs/instruction/B83-tournament-register-broadcast-khong-debounce.md](../instruction/B83-tournament-register-broadcast-khong-debounce.md).

## Trạng thái

✅ ĐÃ XONG (2026-08-09, nhánh `fix/tournament-register-broadcast-debounce`).

Thêm `_queueTournamentDetailUpdate(io, tournament)` trong
`server/socket/handlers/TournamentHandler.js` — gom nhiều
`broadcastTournamentDetail` cho cùng `tournamentId` trong cùng 1 tick
event loop thành 1 lần gọi, dùng `setImmediate` giống hệt khuôn mẫu
`_queuePairingChanged` đã có. `tournament:register`/`tournament:unregister`
gọi hàm mới này thay vì `broadcastTournamentDetail` trực tiếp.
`tournament_started`/`tournament_completed`/`tournament_cancelled` (trong
`init()`) giữ nguyên gọi `broadcastTournamentDetail` trực tiếp, không qua
debounce, đúng như hướng dẫn.

Test: 3 test case mới trong `server/tests/TournamentHandler.test.js` —
(a) 1 lần register đơn lẻ vẫn flush ngay ở tick kế tiếp (`jest.runAllTimers()`),
(b) 2 lần register cùng tournamentId trong 1 burst chỉ gộp thành 1 broadcast,
(c) register nối tiếp unregister cùng tournamentId cũng gộp thành 1. Toàn bộ
`npm test` (39 suites / 951 test) pass.
