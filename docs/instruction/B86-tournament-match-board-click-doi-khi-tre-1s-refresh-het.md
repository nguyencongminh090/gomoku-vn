# B86 — Click bàn cờ trận đấu giải đấu thỉnh thoảng trễ ~1s, refresh thì hết (hướng dẫn thực thi)

Nguồn: báo cáo người dùng, TODO.md #86 (2026-08-09).

## Bối cảnh kỹ thuật

Đã loại trừ qua đọc code (xem `docs/todo/B86-*.md`): không phải trùng lặp
listener trên canvas, không phải rò rỉ listener ở banner/prompt, không phải
ghi DB đồng bộ trên đường đi 1 nước cờ. Đường đi request thật sự lean:

```
client onCellClick → client.emit('tmatch:move', {x,y,...})
  → server socket.on('tmatch:move') → engine.makeMove() (in-memory)
    → timer.switchTurn()/getSync() (in-memory, O(1))
    → io.to(matchRoom).emit('tmatch:moved', movePayload)
  → client.on('tmatch:moved') → updateBoardState() → boardRenderer.setState() → _draw()
```

Không có bước nào trong chuỗi này có lý do nội tại để chậm 1s. Giả thuyết
còn lại: transport-layer (tab throttle khi background, WiFi/mobile network
chuyển mạng, hoặc Cloudflare Tunnel). **Đây là suy luận loại trừ, chưa đo.**

## Cách làm — CHỈ thu thập bằng chứng ở bước này, KHÔNG sửa code

1. **Thêm instrumentation tạm thời** (không phải fix vĩnh viễn) vào
   `client/js/tournament-match.js`:
   - Trong `onCellClick` (dòng ~288-300 của `initBoard()`): ghi lại
     `performance.now()` ngay trước `client.emit('tmatch:move', ...)`.
   - Trong `client.on('tmatch:moved', ...)` (dòng ~157): nếu nước đi vừa
     nhận khớp với nước vừa gửi (so `x`/`y`/của chính mình), tính delta thời
     gian từ lúc emit tới lúc nhận — log ra console (hoặc tạm thời gửi lên
     server qua 1 event debug) nếu delta > 300ms (ngưỡng "đáng nghi", thấp
     hơn nhiều so với 1s để bắt được cả các trường hợp nhẹ hơn).
   - Đồng thời log `client.socket.io.engine.transport.name` (giá trị
     `'websocket'` hay `'polling'`) và `document.visibilityState`/tab có vừa
     background hay không tại thời điểm click — để phân biệt giữa 3 giả
     thuyết transport nêu trên.
2. **Tái hiện thật** trên môi trường người dùng đã báo cáo (không phải mô
   phỏng nhân tạo) — cần ít nhất 1 lần bắt được sự kiện trễ *có kèm số đo*
   (delta ms, transport type, trạng thái tab) trước khi đi tiếp. Nếu không
   tái hiện được sau một thời gian hợp lý, đóng mục lại như "không tái hiện
   được, cần báo cáo lại kèm điều kiện cụ thể (mạng, thiết bị, trình duyệt,
   background tab hay không)" — không đoán tiếp khi không có dữ liệu.
3. **Sau khi có số đo thật:**
   - Nếu delta lớn xảy ra đúng lúc `transport.name === 'polling'` (đã rớt
     khỏi websocket) → xác nhận giả thuyết transport, hướng xử lý là ở tầng
     kết nối (ví dụ xem lại cấu hình `pingTimeout`/`pingInterval` của
     socket.io, hoặc UI phản hồi rõ hơn khi transport xuống cấp) — bàn thêm
     trước khi code, đây là thay đổi hạ tầng kết nối dùng chung toàn app,
     không riêng tournament.
   - Nếu delta lớn xảy ra dù `transport.name === 'websocket'` suốt và tab
     không hề background → giả thuyết transport sai, cần điều tra lại từ
     đầu (có thể là GC pause, hoặc điều gì đó chưa xét tới) — không tự suy
     diễn thêm ở đây, quay lại đọc code với dữ liệu mới trong tay.
   - Nếu delta đo được luôn nhỏ (dưới ngưỡng đáng nghi) dù người dùng vẫn
     *cảm thấy* trễ → khả năng là độ trễ nhận thức (UI không phản hồi ngay
     lập tức dù dữ liệu đã tới, ví dụ do `_draw()` bị xếp hàng sau việc khác
     trên main thread) — hướng điều tra khác hẳn, cần bàn lại.

## Bẫy cụ thể

- Đừng sửa bất cứ dòng code sản phẩm nào (transport config, debounce, retry
  logic...) trước khi có ít nhất 1 lần đo thật — đúng tiền lệ #81/#85: dự
  đoán "hợp lý" từ đọc code đã sai thứ hạng 2/5 mục so với số đo thật.
- Gỡ bỏ instrumentation debug (`console.log`) trước khi coi mục này xong,
  trừ khi quyết định giữ lại như 1 dạng logging vĩnh viễn — nếu giữ lại,
  đó là quyết định riêng cần nêu rõ trong phần Trạng thái, không giữ lại
  ngầm định.
- Không nới `MAX_EVENTS_PER_SECOND` flood-protection
  (`server/socket/SocketHandler.js:66-96`) hay bất kỳ rate limiter nào để
  "thử" — không liên quan tới giả thuyết đang xét, và nới rate limiter
  trong code production chỉ để debug vi phạm quy tắc chung #0 của repo.

## Không thuộc phạm vi (đừng gộp vào mục này)

- Không đụng lại #81 (session-lookup latency lúc connect) — đã đo và đóng,
  đây là lỗi khác (trong lúc đang chơi, không phải lúc vào trận).
- Không đụng `TimerManager`/`GameEngine.makeMove()` — cả hai đã xác nhận
  thuần in-memory, không phải nghi phạm.
