# B170 — Hướng dẫn thực thi

## Cách sửa (nhỏ, nhưng có bẫy thứ tự khởi tạo)

1. Xuất `serverNow` từ `client/js/room-socket.js` — thêm vào `global.RoomSocket = { ... }`. Xuất
   **hàm**, không xuất giá trị `clockOffsetMs`: giá trị bị chụp cứng lúc đọc, hàm thì luôn đọc offset
   mới nhất.
2. `client/js/room-ui.js:464` (`tick()` trong khối countdown `readyDeadline`) gọi
   `RoomSocket.serverNow()` thay cho `Date.now()`.

## Pitfalls

- **Fallback bắt buộc.** `room-ui.js` có thể chạy trước khi `room-socket.js` gắn `global.RoomSocket`,
  và `serverNow()` trả về `Date.now() + 0` cho tới lần `timer:sync` đầu tiên. Viết dạng
  `(global.RoomSocket && global.RoomSocket.serverNow) ? ... : Date.now()` — hành vi khi chưa có
  offset phải **giống hệt hôm nay**, không được vỡ.
- **`readyDeadline` xuất hiện TRƯỚC ván đầu tiên**, tức trước khi có `timer:sync` nào ⇒ rất có thể
  `clockOffsetMs` vẫn là `0` đúng lúc bộ đếm này chạy. **Kiểm tra thực tế điều này trước khi kết luận
  đã sửa xong** — nếu đúng vậy thì sửa call site là cần nhưng *chưa đủ*, và phải quyết định (hỏi
  người dùng): lấy offset từ một nguồn sớm hơn (ví dụ đóng dấu `serverTime` vào chính payload phòng
  chờ) hay chấp nhận và ghi rõ giới hạn. **Đừng lặng lẽ ship phần vỏ.** Đây đúng là kiểu lỗi mà rule
  "Root-cause diagnosis: check the layer below the symptom" cảnh báo.
- Không sửa `tournament-detail.js` / `tournament-match.js` — đã ghi lý do ở `docs/todo/B170-*.md`
  mục "Ngoài phạm vi".
- Không đổi `timer-sync-core.js`. Ngữ nghĩa `clockOffsetMs` (skew **+** transit, cố ý gộp) phải giữ
  nguyên — header file đó giải thích vì sao, và watchdog phòng chơi viết theo ngữ nghĩa này.

## Test

- `client/tests/` (jsdom): stub `global.RoomSocket.serverNow` trả `Date.now() + OFFSET`, đặt
  `readyDeadline`, chạy `tick()`, assert **số giây hiển thị** đúng theo đồng hồ server.
  - Trường hợp: offset `0` (không đổi hành vi cũ), offset **âm lớn** (`−8400`, đúng số đo thật của
    người chơi TQ), offset dương, và **`RoomSocket` chưa tồn tại** (nhánh fallback).
  - Biên: `deadline` bằng đúng `serverNow()` → `0`; sau `deadline` → kẹp ở `0`, không âm.
- Kiểm suite nào đang eval `room-ui.js` (`client/tests/`) — nếu phải nạp thêm module thì thêm đúng
  thứ tự `*.html` nạp (rule CLAUDE.md).

## Sau khi sửa

- **Bump `?v=N` toàn repo** (client-side), verify bằng lệnh grep trong CLAUDE.md — đúng 1 giá trị,
  gồm cả import chéo trong `client/js/diag/`.
