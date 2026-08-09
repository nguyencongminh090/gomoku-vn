# Phần B #81. Vào trận giải đấu (`goToMatch`) dùng full page reload — mỗi lần đều trả giá handshake + session-lookup đồng bộ

**Trạng thái:** ✅ Đã đo, đóng — không phải bottleneck ở quy mô hiện tại (2026-08-09). Xem "Kết
quả đo" ở cuối file.

**Nguồn:** báo cáo người dùng — "moving in tournament (navigate, comein/out...) sometimes slow" (2026-08-09), điều tra qua [docs/tournament-navigation-latency-report.md](../tournament-navigation-latency-report.md) mục 3.1.

## Vấn đề đã xác nhận (đọc code qua CodeGraph, không suy đoán)

`goToMatch()` (`client/js/tournament-detail.js:365`):
```js
function goToMatch(pairingId) {
  window.location.href = `tournament-match.html?tournamentId=...&pairingId=...`;
}
```
Đây là **điều hướng full page**, không phải SPA — mỗi lần bấm "Vào trận" đóng
socket cũ, tải lại toàn bộ trang, mở socket mới, chạy lại toàn bộ handshake
xác thực (`verifySocketToken`).

Handshake đọc session từ SQLite **đồng bộ** (better-sqlite3 = blocking I/O
trên event loop chính). Chính repo đã có script đo việc này
(`server/scripts/bench-session-lookup.js`), với comment gốc xác nhận rủi ro:

> "better-sqlite3 is synchronous — so every lookup blocks the event loop for
> its duration... that burst is exactly where a per-connection blocking read
> would show up."

Nghĩa là: nếu đúng lúc user bấm "Vào trận"/quay lại, server đang có nhiều
connection khác xử lý cùng lúc (nhiều người đang xem/thao tác trong cùng giải
đấu), **event loop bị chặn tuần tự bởi từng session lookup** → mọi request
khác (kể cả của chính user vừa bấm) phải chờ tới lượt. Đây khớp với triệu
chứng "thỉnh thoảng chậm" báo cáo gốc mô tả — phụ thuộc tải tức thời, không
phải lúc nào cũng chậm.

Sau khi socket mới connect, `resyncOnConnect()`
(`server/socket/handlers/TournamentMatchHandler.js:338`) còn duyệt **toàn bộ
`tournamentState.tournamentGameMap`** (mọi trận đang live trên toàn server)
để tìm trận của user đó — chi phí O(n) theo tổng số trận tournament đang diễn
ra toàn hệ thống, chạy lại mỗi lần connect.

## Việc cần làm

Xem hướng dẫn chi tiết: [docs/instruction/B81-tournament-navigate-full-page-reload-session-lookup-blocking.md](../instruction/B81-tournament-navigate-full-page-reload-session-lookup-blocking.md).

## Kết quả đo (2026-08-09) — theo đúng bước 1 của instruction, đo trước khi sửa

`instruction.md` yêu cầu đo `bench-session-lookup.js` ở quy mô thực tế (không phải kịch bản stress
6000 connection/#28/#29) trước khi quyết định hướng sửa. Đã mở rộng script với 1 khối đo riêng
(`REALISTIC_TABLE_SIZES`/`REALISTIC_BURST_SIZES` trong
[server/scripts/bench-session-lookup.js](../../server/scripts/bench-session-lookup.js)), giữ nguyên
khối đo stress-test gốc:

- **Table size:** 20 / 100 / 500 dòng — sát với số dòng thật hiện có trong `sessions` table
  (`sqlite3 server/db/gomoku.db "SELECT COUNT(*) FROM sessions"` → 18 dòng tại thời điểm đo), có biên
  độ tăng trưởng hợp lý thay vì con số 100k giả lập của kịch bản stress.
- **Burst size:** 8 / 16 / 32 / 64 — số người trong **1 giải đấu** cùng bấm "Vào trận" gần như đồng
  thời khi 1 vòng đấu mở ra; không dùng 6000 (đó là ngưỡng stress test toàn hệ thống của #28/#29,
  không phải kịch bản goToMatch của mục này).

Kết quả (`node server/scripts/bench-session-lookup.js`):

```
── sessions table: 20 rows ──
  burst     8: total     0.1 ms  |  p50    5.9 µs  p99    46.1 µs  max     46.1 µs
  burst    16: total     0.1 ms  |  p50    5.7 µs  p99    10.5 µs  max     10.5 µs
  burst    32: total     0.2 ms  |  p50    5.6 µs  p99     7.8 µs  max      7.8 µs
  burst    64: total     0.4 ms  |  p50    5.6 µs  p99    13.6 µs  max     13.6 µs

── sessions table: 100 rows ──
  burst     8: total     0.3 ms  |  p50    5.6 µs  p99    24.1 µs  max     24.1 µs
  burst    16: total     0.1 ms  |  p50    5.6 µs  p99     8.6 µs  max      8.6 µs
  burst    32: total     0.2 ms  |  p50    5.5 µs  p99     7.9 µs  max      7.9 µs
  burst    64: total     0.4 ms  |  p50    5.9 µs  p99    11.9 µs  max     11.9 µs

── sessions table: 500 rows ──
  burst     8: total     0.1 ms  |  p50    5.9 µs  p99    22.4 µs  max     22.4 µs
  burst    16: total     0.1 ms  |  p50    5.8 µs  p99     7.8 µs  max      7.8 µs
  burst    32: total     0.2 ms  |  p50    5.8 µs  p99    15.5 µs  max     15.5 µs
  burst    64: total     0.4 ms  |  p50    5.8 µs  p99     7.5 µs  max      7.5 µs
```

Ngay cả ở kịch bản stress-test gốc (100k dòng, burst 6000 — vượt xa quy mô thực tế của mục này),
p50 vẫn chỉ ~7.6 µs; "total" (chặn event loop nếu cả burst đến cùng lúc) tệ nhất chỉ 56.4 ms cho 6000
lookup liên tiếp.

**Kết luận:** p50/p99 ở quy mô thực tế đều ở mức **đơn vị-chục µs** (worst case: p99 46.1 µs ở
burst 8/20 dòng, do lần đầu chưa warm cache), thấp hơn nhiều so với ngưỡng "vài trăm µs" mà
`instruction.md` đặt ra để coi là đáng sửa. Ngay cả worst-case "total" (mọi request đến đúng cùng 1
tick event loop — kịch bản không thực tế, vì client thật rải ra theo thời gian bấm) cho burst 64
cũng chỉ 0.4 ms. **Session-lookup đồng bộ tại handshake KHÔNG phải bottleneck đáng kể ở quy mô hiện
tại của app này** — không cần thêm in-memory session cache (bước 2 của instruction chỉ áp dụng "nếu
số đo xác nhận đáng kể", và số đo ở đây không xác nhận).

`resyncOnConnect()` duyệt toàn bộ `tournamentGameMap` (bước 4 của instruction) cũng không đáng sửa ở
quy mô hiện tại cùng lý do — instruction đã nêu rõ chỉ đáng sửa khi số trận live đồng thời toàn
server đủ lớn để đo được, và không có bằng chứng nào cho thấy quy mô đó đang xảy ra.

Việc chuyển `goToMatch()` sang SPA-navigation (bước 3 của instruction) vẫn **không được tự làm trong
phạm vi mục này** theo đúng chỉ dẫn — số đo không cho thấy đây là nguồn trễ chính đủ để biện minh cho
thay đổi kiến trúc đó; nếu cần, đây là quyết định riêng cần thảo luận qua `features/<slug>/` trước.

**Đóng mục này**: đã đo theo đúng yêu cầu, không phải bottleneck ở quy mô hiện tại, không sửa gì
thêm. Nếu sau này quy mô thực tế (số người đồng thời/1 giải đấu, số trận live toàn server) tăng đáng
kể, đo lại bằng script đã mở rộng trước khi quyết định lại.
