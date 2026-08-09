# Báo cáo đo latency: giải đấu 20 người chơi đồng thời (TODO.md #86)

Ngày: 2026-08-09

## Mục tiêu

TODO.md #86 báo cáo click bàn cờ trong trận đấu giải đấu thỉnh thoảng trễ ~1s.
Sau khi loại trừ các nguyên nhân trong code ứng dụng (xem `docs/todo/B86-*.md`),
giả thuyết còn lại nghiêng về tầng transport/mạng chứ không phải logic server.
Mục đo này kiểm tra riêng phần **có thể đo được từ phía server**: liệu server
có tự sinh ra độ trễ đáng kể khi phải xử lý tải thật của **1 giải đấu 20 người
chơi đồng thời** (10 trận đấu song song, mỗi trận cùng gửi nước đi cùng lúc)
hay không.

## Phương pháp

Script mới: [`scripts/tournament-latency-test.js`](../scripts/tournament-latency-test.js)
— tái sử dụng kỹ thuật mint JWT trực tiếp (bỏ qua `POST /api/auth/guest` thật,
giống `scripts/capacity-test/worker.js`) để mở 20 socket.io connection thật:

1. Tạo 1 giải đấu `round_robin` với 20 người chơi đã đăng ký → vòng 0 tự động
   tạo đúng 10 cặp đấu đồng thời (20 người, không dư, không có bye).
2. Với cả 10 cặp đấu **chạy song song** (không tuần tự): báo giờ → xác nhận
   giờ → cả 2 bên "Sẵn sàng" → vào trận (`tmatch:init`).
3. Mỗi cặp đấu chơi 20 nước luân phiên. Mỗi nước đo từ lúc socket người đi
   `emit('tmatch:move', ...)` tới lúc **chính socket đó** nhận lại
   `tmatch:moved` — đúng đường đi "click → quân xuất hiện" mà #86 báo cáo,
   đo ở tầng socket (không tính thời gian vẽ lại canvas phía client, xem
   "Giới hạn" bên dưới).
4. Tổng cộng 200 nước đi đo được (10 cặp × 20 nước), tất cả 10 cặp chạy đồng
   thời — đúng tải thực tế của 1 giải đấu 20 người đang ở giữa 1 vòng đấu.

**An toàn dữ liệu:** chạy trên server tạm với DB rỗng (di chuyển
`server/db/gomoku.db` thật sang chỗ khác trước, khôi phục lại sau — đúng quy
trình `Playwright/db-safety` của repo). Đã xác nhận khôi phục đúng bằng
checksum MD5 khớp trước/sau. Không có dữ liệu giả nào lẫn vào db thật.

**Môi trường:** localhost (client đo và server cùng máy, cùng tiến trình
Node) — xem "Giới hạn" bên dưới về ý nghĩa của điều này.

## Kết quả

Từ [`docs/tournament-latency-test-1786249159536.json`](tournament-latency-test-1786249159536.json)
(dữ liệu thô đầy đủ, bao gồm số liệu riêng từng cặp đấu):

| Chỉ số | Giá trị |
|---|---|
| Số người chơi | 20 |
| Số cặp đấu đồng thời | 10 |
| Tổng số nước đi đo được | 200 |
| Thời gian hoàn thành toàn bộ (wall clock) | 46 ms |
| Latency min | 0.07 ms |
| Latency p50 | 1.29 ms |
| Latency p90 | 2.96 ms |
| Latency p99 | 5.35 ms |
| Latency max | 5.39 ms |
| Số nước ≥300ms (ngưỡng "đáng nghi" theo B86) | **0** |
| Số nước ≥1000ms (đúng triệu chứng báo cáo) | **0** |
| Transport dùng | 100% `websocket` (không rơi về `polling` lần nào) |
| Lỗi | Không có |

Toàn bộ 200 nước đi, dưới tải 10 trận đấu chạy song song từ 20 người chơi,
đều hoàn tất **dưới 6ms** — không có nước nào tiệm cận ngưỡng 300ms, càng
không có nước nào gần 1000ms như báo cáo gốc mô tả.

## Kết luận

**Server, ở mức tải đúng bằng 1 giải đấu 20 người, không tự sinh ra độ trễ
đáng kể trên đường đi `tmatch:move` → `tmatch:moved`.** Điều này khớp với
phân tích code tĩnh đã làm trước đó (`docs/todo/B86-*.md`): không có ghi DB
đồng bộ, không có vòng lặp O(n) nào trên đường đi 1 nước cờ, và bản thân việc
10 trận chạy đồng thời cũng không làm event loop bị nghẽn tới mức đo được.

**Điều đo này KHÔNG chứng minh**: đây là môi trường localhost, không có độ
trễ mạng thật, không có Cloudflare Tunnel, không có tab bị trình duyệt
throttle khi chuyển nền, không có client thật render lại canvas. Giả thuyết
transport/mạng nêu trong `docs/instruction/B86-*.md` (tab background
throttle, WiFi/mobile chuyển mạng, hoặc chính Cloudflare Tunnel) **vẫn chưa
được đo trực tiếp** — phép đo này chỉ loại trừ thêm một khả năng (server
không đủ tải để tự chậm), thu hẹp phạm vi nghi ngờ, không đóng được mục #86.

## Bước tiếp theo (chưa làm — theo hướng dẫn B86)

Vẫn cần tái hiện thật với instrumentation client-side (delta click→ack đo tại
trình duyệt thật, `transport.name`, `document.visibilityState`) như
`docs/instruction/B86-*.md` đã đề ra — phép đo server-side này không thay thế
được bước đó, chỉ loại trừ được 1 nghi phạm (tải server) trước khi tiếp tục
điều tra ở tầng transport/mạng.
