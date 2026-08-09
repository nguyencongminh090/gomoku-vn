# B81 — Vào trận giải đấu dùng full page reload, trả giá session-lookup đồng bộ mỗi lần (hướng dẫn thực thi)

Nguồn: báo cáo người dùng, TODO.md #81 (2026-08-09).

## Bối cảnh kỹ thuật

`goToMatch()` (`client/js/tournament-detail.js:365`) điều hướng bằng
`window.location.href`, không phải SPA-style. Mỗi lần vào trận = tải lại
trang = socket mới = handshake mới = 1 lượt đọc session SQLite đồng bộ
(`verifySocketToken`, better-sqlite3 blocking). Đây là hành vi **thiết kế từ
trước** (routing multi-page của toàn app, không riêng tournament), nên đây
KHÔNG phải bug đơn lẻ mà là đặc điểm kiến trúc — sửa cần cẩn trọng.

## Cách làm — theo thứ tự, dừng lại nếu bước đo không xác nhận vấn đề

1. **Trước tiên: đo, đừng đoán.** Chạy lại/mở rộng
   `server/scripts/bench-session-lookup.js` (đã có sẵn) với table size gần
   với thực tế hiện tại của `sessions` table (không phải chỉ 1k/100k giả
   lập), và đo ở mức burst tương ứng với số người thực tế đang mở
   `tournament-detail.html`/`tournament-match.html` đồng thời trong 1 giải
   đấu thật (không phải 6000 — con số đó là kịch bản stress test khác,
   TODO.md #28/#29). Nếu p50/p99 ở quy mô thực tế đã nhỏ (vài trăm µs), đây
   không phải nguyên nhân đủ lớn để đáng sửa — đóng mục này lại là "không
   phải bottleneck ở quy mô hiện tại", không ép sửa.
2. **Nếu đo xác nhận có ảnh hưởng đáng kể:** hướng sửa khả thi nhất là cache
   session lookup trong bộ nhớ (in-memory Map, TTL ngắn) để tránh đọc SQLite
   lặp lại cho cùng 1 session còn hiệu lực trong khoảng thời gian ngắn —
   đúng như phần comment gốc của `bench-session-lookup.js` đã gợi ý: "only
   adding an in-memory cache if the numbers demand one". Không tự ý đổi
   sang session lookup bất đồng bộ (`async`/promise) chỉ để "không block" —
   Node đơn luồng, code xử lý sau đó vẫn cần session trước khi tiếp tục, đổi
   sang async chỉ dời điểm chờ chứ không giảm tổng thời gian, trong khi tăng
   độ phức tạp code đáng kể.
3. **Việc chuyển `goToMatch()` từ full page reload sang điều hướng SPA-style
   (giữ nguyên socket)** là thay đổi kiến trúc lớn hơn nhiều, ảnh hưởng toàn
   bộ luồng multi-page hiện tại (mọi trang khác cũng dùng
   `window.location.href` tương tự) — **không tự làm trong phạm vi mục
   này**. Nếu số đo ở bước 1 cho thấy đây thực sự là nguồn trễ chính, ghi
   một `features/<slug>/` thảo luận riêng trước khi động vào (theo đúng quy
   tắc "features/ pre-implementation discussion" trong CLAUDE.md) — đây là
   quyết định kiến trúc, không phải bug-fix đơn giản.
4. **`resyncOnConnect()` duyệt toàn bộ `tournamentGameMap`** — chỉ đáng sửa
   (đổi từ O(n) sang tra theo `userId` trực tiếp, ví dụ thêm 1 Map phụ
   `userId → pairingId`) nếu số đo cho thấy số trận live đồng thời toàn
   server đủ lớn để vòng lặp này đo được — với quy mô nhỏ (vài chục trận),
   đây không đáng sửa.

## Bẫy cụ thể

- Đừng cache session theo cách làm hỏng revocation (TODO.md #68 — session có
  thể bị thu hồi/kick chủ động). Nếu thêm cache, TTL phải đủ ngắn hoặc phải
  chủ động invalidate cache khi `sessionManager` revoke một session.
- Đừng đổi hành vi multi-page routing của toàn app chỉ vì tournament — đây
  là pattern dùng chung, đổi không cẩn thận sẽ ảnh hưởng room/lobby/history
  cũng đang dùng `window.location.href` y hệt.

## Không thuộc phạm vi (đừng gộp vào fix này)

- Không đổi cách xác thực JWT/HttpOnly cookie (đã xử lý ở #68) — mục này chỉ
  về chi phí *đọc lại* session, không phải cách xác thực.
- Không đổi `TimerManager`/`PairingLifecycle.js` slot cố định — không liên
  quan tới mục này.
