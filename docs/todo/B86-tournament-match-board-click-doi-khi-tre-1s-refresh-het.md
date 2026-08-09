# Phần B #86. Trận đấu giải đấu: click bàn cờ thỉnh thoảng trễ ~1s trước khi quân xuất hiện, refresh trang thì lại nhanh — cần đo trước khi sửa

**Nguồn:** báo cáo người dùng — "user click on board but delay for 1s (low latency) it sometimes happen, but after refresh, it work fast again" (2026-08-09).

## Vấn đề báo cáo

Trong `tournament-match.html` (trận đấu giải đấu), thỉnh thoảng người chơi bấm
vào bàn cờ nhưng quân cờ xuất hiện trễ khoảng 1 giây thay vì gần như tức thời.
Sau khi refresh trang (F5), lại nhanh bình thường. Đặc điểm "refresh sửa được"
là dấu hiệu quan trọng — gợi ý nguyên nhân nằm ở trạng thái tích luỹ trong
phiên (session) hiện tại, không phải một lỗi cấu trúc cố định trong code, vì
refresh về cơ bản là "chạy lại từ đầu" toàn bộ trạng thái client.

## Đã kiểm tra qua CodeGraph — LOẠI TRỪ được các khả năng sau (không phải nguyên nhân)

- **Không phải trùng lặp event listener trên canvas.** `initBoard()`
  (`client/js/tournament-match.js:278`) có guard `if (boardRenderer) return;`
  — canvas chỉ bao giờ có đúng 1 `BoardRenderer` (và do đó đúng 1 bộ listener
  `mousemove`/`mouseleave`/`click`/`touchend`, xem `board.js:75-79`), dù
  `tmatch:init` có thể bắn nhiều lần (reconnect, ván mới trong series).
- **Không phải rò rỉ listener ở các banner/prompt.** `renderSwap2Banner()`,
  `renderDrawPrompt()`, `renderTimePrompt()`
  (`tournament-match.js:425-457, 564-608`) đều gán lại `innerHTML` trước khi
  gắn listener mới — DOM node cũ (và listener cũ gắn trên nó) bị huỷ hoàn
  toàn mỗi lần render lại, không cộng dồn.
- **Không phải xử lý đồng bộ nặng phía server.** `socket.on('tmatch:move', ...)`
  (`server/socket/handlers/TournamentMatchHandler.js:581-631`) chỉ gọi
  `engine.makeMove()` (thuần in-memory) + `timer.switchTurn()`/`getSync()`
  (`TimerManager.js`, cũng thuần in-memory, O(1)) — **không có ghi SQLite
  đồng bộ nào trên đường đi của 1 nước đi**; `savePairing()` (điểm nghi ngờ
  ở #85) chỉ chạy khi ván kết thúc (`_endMatch`), không chạy per-move.

## Chưa xác định được — cần đo, không suy đoán tiếp

Sau khi loại trừ các nguyên nhân trong code ứng dụng, giả thuyết còn lại
nghiêng về **lớp transport/mạng**, không phải logic:

- Tab bị trình duyệt throttle khi chuyển nền (background tab), khiến kết nối
  WebSocket "âm thầm" xuống cấp cho tới khi cơ chế reconnect của socket.io
  tự phát hiện và khôi phục.
- Một chặng mạng chập chờn (WiFi, chuyển mạng di động, hoặc chính Cloudflare
  Tunnel) khiến socket.io rơi về long-polling hoặc dồn ứ frame mà không báo
  disconnect rõ ràng.
- Refresh về cơ bản ép tạo lại toàn bộ kết nối/transport từ đầu — khớp với
  quan sát "refresh thì lại nhanh".

**Không có bằng chứng nào trong code xác nhận cụ thể nguyên nhân nào ở trên**
— đây là suy luận loại trừ, không phải kết luận đã đo. Theo đúng nguyên tắc
"Root-cause diagnosis" của repo (đã áp dụng đúng ở #81/#85 — dự đoán ban đầu
sai thứ hạng 2/5 mục so với số đo thật), **không sửa gì cho tới khi có số đo
thật từ 1 lần tái hiện lỗi**.

## Việc cần làm

Xem hướng dẫn chi tiết: [docs/instruction/B86-tournament-match-board-click-doi-khi-tre-1s-refresh-het.md](../instruction/B86-tournament-match-board-click-doi-khi-tre-1s-refresh-het.md).

## Đo lần 1 (2026-08-09) — tải server với 1 giải đấu 20 người chơi thật

Script: [`scripts/tournament-latency-test.js`](../../scripts/tournament-latency-test.js).
Báo cáo đầy đủ: [docs/tournament-20-player-latency-test-report.md](../tournament-20-player-latency-test-report.md).

Mô phỏng 1 giải đấu `round_robin` 20 người chơi thật (20 socket.io connection
thật, không mock), 10 cặp đấu chạy đồng thời, 200 nước đi đo được (localhost,
db tạm — đã khôi phục db thật, checksum khớp). Kết quả: p50 1.29ms, p99
5.35ms, max 5.39ms — **0 nước đi vượt ngưỡng 300ms, 0 nước vượt 1000ms.**

**Kết luận đo lần 1:** server, ở đúng mức tải 1 giải đấu 20 người, không tự
sinh độ trễ đáng kể trên đường đi `tmatch:move → tmatch:moved`. Loại trừ
thêm được 1 khả năng (tải server dưới nhiều trận đồng thời) — nhưng đo này
chạy trên localhost, không có mạng thật/Cloudflare Tunnel/tab throttle, nên
**không đóng được mục này** — giả thuyết transport/mạng của
`docs/instruction/B86-*.md` vẫn chưa được đo trực tiếp.

## Instrumentation client-side (2026-08-09)

Đã thêm instrumentation tạm thời vào `client/js/tournament-match.js` đúng
bước 1 của `docs/instruction/B86-*.md` (chưa sửa code production nào khác):

- Trong `onCellClick` (`initBoard()`): trước khi `client.emit('tmatch:move',
  ...)`, ghi lại `pendingMoveInstrumentation = { x, y, color, t0:
  performance.now(), transport, hidden }` — `transport` đọc từ
  `client.socket.io.engine.transport.name`, `hidden` từ
  `document.visibilityState !== 'visible'` tại thời điểm click.
- Trong `client.on('tmatch:moved', ...)`: nếu nước đi nhận về khớp
  `x`/`y`/`color` với `pendingMoveInstrumentation`, tính
  `delta = performance.now() - t0`; nếu `delta > 300ms`, `console.warn`
  `'[B86 instrumentation] slow click→ack'` kèm `deltaMs`, `transportAtClick`,
  `transportNow`, `tabHiddenAtClick`, `tabHiddenNow`, `x`, `y`.
- Version bump `?v=93` → `?v=94` (client/js/tournament-match.js thay đổi —
  theo đúng quy tắc cache-busting của CLAUDE.md, xác nhận bằng
  `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` → 1 giá trị
  duy nhất `?v=94`).

**Chưa tái hiện được lỗi thật** — bước 2 (tái hiện trên môi trường người
dùng đã báo cáo, bắt được ít nhất 1 lần delay kèm số đo) cần người dùng thật
sự chơi trận đấu giải đấu và gặp lại độ trễ, agent không tự tái hiện được
điều kiện mạng/tab-background thật. Console sẽ tự log khi bắt được — cần
người dùng mở DevTools Console trong lúc chơi (đặc biệt khi nghi ngờ sắp bị
trễ) và báo lại nội dung log nếu thấy `[B86 instrumentation] slow click→ack`.

## Trạng thái

Chưa xong — đã thêm instrumentation client-side (xem trên), còn thiếu tái
hiện thật kèm số đo trước khi kết luận nguyên nhân. Nhắc: gỡ instrumentation
này sau khi có kết luận, trừ khi quyết định giữ lại làm logging vĩnh viễn
(đầu instruction.md — "Bẫy cụ thể").
