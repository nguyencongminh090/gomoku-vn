# B85 — Đo trước khi sửa: `savePairing()` ghi đồng bộ + blob JSON tăng dần (hướng dẫn thực thi)

Nguồn: báo cáo người dùng, TODO.md #85 (2026-08-09).

## Bối cảnh kỹ thuật

`savePairing()` (`server/db/database.js:605-636`) ghi đồng bộ mỗi khi trạng
thái pairing đổi, `JSON.stringify` lại toàn bộ `games`/`moves` mỗi lần (không
phải append). Đây là mục có **độ tin cậy thấp nhất** trong 5 phát hiện của
báo cáo gốc — chưa có số đo thực tế, chỉ là suy luận từ đọc code. Theo đúng
nguyên tắc "Root-cause diagnosis" của repo (CLAUDE.md): fix trên phỏng đoán,
không đo, rất dễ vá sai lớp.

## Cách làm — CHỈ đo trong bước này, KHÔNG sửa code cho tới khi có số liệu

1. Thêm log tạm thời (không commit vĩnh viễn — hoặc dùng
   `console.time`/`process.hrtime` tạm trong lúc đo, gỡ ra trước khi kết
   thúc mục này nếu quyết định không sửa) quanh lệnh `.run(...)` trong
   `savePairing()`: đo (a) kích thước chuỗi JSON của `games`/`moves` ngay
   trước khi ghi, (b) thời gian thực thi statement.
2. Tái hiện 1 trận đấu series dài (nhiều ván, seriesMode bật) trên server
   thật (dev), theo dõi log qua các ván — xem kích thước blob và thời gian
   ghi tăng theo tốc độ nào (tuyến tính theo số nước đi? theo số ván?).
3. So sánh thời gian ghi đo được với ngưỡng "đáng lo": nếu p99 vẫn dưới ~5ms
   ngay cả ở ván cuối 1 series dài, đây **không phải bottleneck đáng sửa** ở
   quy mô hiện tại — đóng mục lại với ghi chú "đã đo, không phải nguyên
   nhân" trong phần Trạng thái của `docs/todo/B85-*.md`, tương tự tiền lệ
   #63 ("không phải bug", đóng sau khi đối chiếu thực tế).
4. **Chỉ nếu** số đo cho thấy chặn event loop đáng kể (ví dụ hàng chục ms
   trở lên ở trận dài), mới cân nhắc hướng sửa — và khi đó cần thảo luận lại
   hướng cụ thể (ví dụ: tách `moves` sang bảng riêng để UPDATE không phải
   viết lại toàn bộ blob mỗi lần, hoặc batch-write định kỳ thay vì mỗi nước
   đi) trước khi code, vì đây là thay đổi schema có ảnh hưởng rộng (đụng
   `tournament_pairings`, mọi nơi đọc `pairing.moves`/`pairing.games`).

## Bẫy cụ thể

- Đừng đổi sang ghi bất đồng bộ (worker thread, queue) chỉ để "cảm thấy
  nhanh hơn" mà không có số đo — độ phức tạp thêm vào (đảm bảo thứ tự ghi,
  xử lý lỗi async) không đáng nếu vấn đề gốc không đủ lớn.
- Đừng đổi cấu trúc bảng `tournament_pairings` (thêm bảng `moves` riêng,
  v.v.) trong mục này — đó là quyết định kiến trúc cần bàn riêng qua
  `features/<slug>/` nếu bước đo xác nhận cần thiết, không tự ý làm ở đây.

## Không thuộc phạm vi (đừng gộp vào fix này)

- Không đụng `tournament_games` (bảng lưu ván đã hoàn thành, B78) — mục này
  chỉ về `tournament_pairings.games`/`.moves`, bảng lưu trạng thái đang diễn
  ra của pairing.
- Không đổi các mục #81-#84 — đây là mục độc lập, đo trước rồi mới quyết
  định có sửa hay không.
