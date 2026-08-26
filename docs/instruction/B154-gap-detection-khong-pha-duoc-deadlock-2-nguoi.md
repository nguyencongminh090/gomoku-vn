# B154 — Hướng dẫn thực thi: phần còn thiếu của gap detection

**Việc:** `docs/todo/B154-gap-detection-khong-pha-duoc-deadlock-2-nguoi.md`

---

## Đọc trước

`docs/todo/B152-*.md` mục 5 và `docs/fix-log/2026-08-24-todo-152-game-move-ack-retry-resync.md`
phần "Hạn chế đã phát hiện". Đừng điều tra lại từ đầu: đã xác minh xong rằng không có broadcast định
kỳ nào trong hệ thống hiện tại để làm sự kiện đánh thức, và rằng gap detection của #152 chạy đúng —
nó chỉ không có gì để kích hoạt trong kịch bản 2 người luân phiên.

## Ranh giới — "đừng làm"

- **Đừng sửa gap detection hiện có** trong `client/js/room-socket.js` (`game:moved`). Nó đúng và đã
  có test (`client/tests/game-move-ack-retry-resync.test.js`). Bẫy resync-vô-hạn (bẫy 7 của #152) là
  thật — mọi đường "nạp state đầy đủ" phải reset baseline, đừng đụng vào ranh giới đó.
- **Đừng dựng đường resync mới.** `game:resync` đã có (`server/socket/handlers/GameHandler.js`), trả
  về `room:joined` dựng bởi `buildRoomStatePayload()`. Dùng lại.
- **Đừng siết `pingInterval`/`pingTimeout`** — đã loại khỏi phạm vi ở #152, lý do vẫn nguyên.

## Bẫy

1. **Chọn ngưỡng watchdog bằng cảm tính.** Cờ caro có nước nghĩ rất lâu; watchdog quá nhạy sẽ bắn
   `game:resync` liên tục ở ván bình thường. Tiền lệ #131: chọn 8000ms từ 1 mẫu HAR, phải retune lên
   12000ms sau khi đo phân bố thật. Đo trước.
2. **Watchdog phải tự huỷ đúng chỗ.** Nó chỉ có nghĩa khi client *tin rằng* đang là lượt đối thủ và
   ván đang `ongoing`. Kết thúc ván, undo, Swap2 opening, người chơi rời phòng — mọi đường đổi state
   phải xoá watchdog, nếu không sẽ có resync mồ côi bắn sau khi ván đã xong.
3. **Đụng `client/` ⇒ bump `?v=N` toàn repo** (cả cross-import trong `client/js/*.js`).

## Phạm vi mở rộng, phát hiện khi đánh giá #155 (2026-08-26)

`docs/todo/B154-*.md` mục "Biến thể thứ hai" mô tả một case đối xứng: **chính người vừa đi** cũng có
thể kẹt nếu ack thành công nhưng gói `game:moved` broadcast cho họ bị rớt độc lập — không có timeout
nào kích hoạt retry (retry chỉ chạy khi ack timeout). Khi implement watchdog theo lượt, **thiết kế
cho cả hai phía dùng chung một cơ chế** thay vì chỉ phía "đang chờ đối thủ":

- Phía chờ đối thủ (kịch bản gốc): tin rằng đang là lượt đối thủ mà quá N giây không có `game:moved`
  → `game:resync`.
- Phía vừa gửi (biến thể mới): có `optimisticStone`/(sau #155) `predictedTurn` đang active mà quá N
  giây không có `game:moved` khớp toạ độ xác nhận nó → cùng `game:resync`.

Cả hai đều dùng chung ngưỡng N và chung lệnh gọi `game:resync` — không cần hai cơ chế riêng, chỉ khác
điều kiện kích hoạt. Nếu #155 được làm **trước** #154, `sendMove` trong `game-ui.js` cần tự có một
timeout ngắn tối thiểu cho riêng case "ack ok nhưng chưa thấy game:moved của chính mình" (không đợi
watchdog tổng quát của #154), để `predictedTurn` không kẹt vô thời hạn — ghi rõ trong
`docs/instruction/B155-*.md`.

## Test

Hạ tầng đã có sẵn cho cả hai tầng — `server/tests/` (Jest) và `client/tests/` (Jest + jsdom, xem
`client/tests/game-move-ack-retry-resync.test.js` làm mẫu cho việc nạp `room-socket.js` với global
giả). Verify thật: `e2e/game-move-ack-resync.spec.ts` đã có sẵn cách mô phỏng mất gói (vá
`Socket#packet` phía trang) — tái dùng, đừng nghĩ lại cách mô phỏng.

Ca bắt buộc: hai người luân phiên, rớt đúng một `game:moved` tới một bên, **không ai bấm gì thêm** —
bên kẹt phải tự phục hồi trong ngưỡng đã chọn.
