# B33. Kiểm tra tư cách người chơi khi chấp nhận/từ chối đề nghị hoà (từ recheck security review, 2026-08-03)

### B33. Kiểm tra tư cách người chơi khi chấp nhận/từ chối đề nghị hoà (từ recheck security review, 2026-08-03)

- Đây là bug thật đang mở, không phải phòng thủ chiều sâu như B32 — đã xác
  nhận CONFIRMED qua vòng lọc false-positive độc lập (confidence 9/10), có
  đường khai thác cụ thể bởi khán giả (bên thứ ba không có ghế), không phải
  suy đoán lý thuyết.
- **Sửa đúng bằng cách tái dùng pattern có sẵn trong cùng file** — không cần
  thiết kế mới: `resign()` và `offerDraw()` (`server/managers/GameEngine.js`,
  cùng file) đã có đúng dòng kiểm tra
  `const player = this.players.find(p => p.userId === userId); if (!player) return { error: 'Bạn không phải người chơi.' };`
  Copy đúng logic đó vào đầu `acceptDraw(userId)` và `declineDraw(userId)`,
  trước dòng kiểm `drawOffer.from`.
- **Không đụng vào handler socket** (`GameHandler.js` `game:draw_accept`/
  `game:draw_decline`) — kiểm tra nên đặt ở tầng `GameEngine` (nguồn sự thật
  của trạng thái ván), không phải tầng handler, để bất kỳ lối gọi nào khác
  tới `acceptDraw`/`declineDraw` trong tương lai cũng được bảo vệ, không chỉ
  lối gọi qua socket hiện tại.
- **Không đổi thông báo lỗi `'Bạn không phải người chơi.'`** — đây là chuỗi
  đã dùng sẵn cho `resign`/`offerDraw`, giữ nguyên để nhất quán UX, không bịa
  thông báo mới.
- Test: theo rule "Bug-fix workflow" — thêm case vào file test hiện có của
  `GameEngine` (nếu có) hoặc file mới, dựng đúng kịch bản: 1 người chơi + 1
  "khán giả" (userId không nằm trong `players`) gọi `acceptDraw`/
  `declineDraw`, assert bị từ chối với đúng lỗi trên và ván **không** kết
  thúc/không đổi `drawOffer`. Mutation-check: gỡ dòng kiểm tra mới, xác nhận
  test đỏ.
