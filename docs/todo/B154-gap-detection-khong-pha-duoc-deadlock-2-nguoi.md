# B154 — Gap detection của #152 không phá được deadlock 2 người khi rớt `game:moved`

**Trạng thái:** ✅ Đã sửa (2026-08-26) — `fix/turn-watchdog-resync-deadlock` off `dev`

Watchdog theo lượt phía client, bắn ở **phân số α = 0,75 của đồng hồ đang theo dõi** rồi gọi
`game:resync` (primitive #152, không dựng đường mới). Cả hai biến thể mô tả dưới đây đều đã bịt:
biến thể gốc bằng watchdog này, biến thể thứ hai bằng move-confirm watchdog 2500ms.

**Ngưỡng đã đo, không chọn cảm tính** (#131): 334 ván / 9.429 khoảng lặng thật từ `games.moves` —
p50 5,0s · p90 24,8s · p99 50,4s · p99.9 83,5s. Hằng số phẳng 15s sẽ bắn ở **75% số ván**.

⚠ **Bản nháp đầu dùng "deadline trôi qua trong im lặng" — đúng logic nhưng tới muộn hơn chính cú
thua giờ của người kẹt, và Playwright bắt được** (thua giờ ở giây 14,8, watchdog hẹn ở giây 21). Lý
do và cách phân số sửa nó nằm ở comment trong `client/js/room-socket.js` và trong fix log — đọc
trước nếu định chỉnh ngưỡng.

24 unit test mới (`client/tests/turn-watchdog-resync.test.js`), bỏ fix ra thì 9/22 fail;
`npm test` **1342/1342**. Verify thật bằng Playwright trên instance cô lập —
`e2e/turn-watchdog-resync.spec.ts`, đúng "ca bắt buộc" của instruction (2 người, 1 gói rớt, không ai
bấm gì). `?v=153→154`.

Chi tiết thực thi: `docs/fix-log/2026-08-26-todo-154-turn-watchdog-resync.md`.

**Severity:** Medium (không tự phục hồi, nhưng có chặn trên: người kẹt thua giờ thay vì treo vĩnh viễn)
**Platform:** Mọi nền tảng, mạng mất gói
**Pages affected:** `room.html` (bàn cờ khi đang chơi)
**Phát sinh từ:** thực thi #152 (2026-08-24) — không phải báo cáo mới

---

## Vấn đề

#152 mục 5 thêm gap detection ở phía nhận: `game:moved` mang `moveCount` nhảy cóc ⇒ đã lỡ broadcast ⇒
gọi `game:resync`. Đã làm và đã verify chạy đúng.

Nhưng nó **không** phá được đúng kịch bản deadlock mà `docs/todo/B152-*.md` mục 5 mô tả:

> A đi → B rớt gói `game:moved` → B vẫn tưởng chưa tới lượt mình → A chờ B, B chờ A.

Gap detection chỉ kích hoạt khi có **một `game:moved` tiếp theo** tới nơi. Với 2 người luân phiên
nghiêm ngặt, gói tiếp theo đó **chính là** nước mà người kẹt đang chờ — nó không bao giờ tới, nên
không có gì để so `moveCount` với. Deadlock vẫn nguyên.

**Đã kiểm chứng không có sự kiện đánh thức nào khác:** `TimerManager` tick **thuần server-side**
(`server/managers/TimerManager.js:68`, comment ở `:11` nói rõ), không broadcast định kỳ —
`grep 'game:timer' client/js/room-socket.js` không ra kết quả. Đồng hồ chỉ đi kèm `game:moved`
(`movePayload.timer`/`timerSync`), tức đúng gói đã rớt.

Mục 5 **vẫn hữu ích** và phải giữ: nó cứu mọi client nhận được broadcast sau đó — khán giả (đã verify
bằng Playwright trong `e2e/game-move-ack-resync.spec.ts`) và mọi luồng không luân phiên nghiêm ngặt.
Đây là phần còn thiếu, không phải lỗi của mục 5.

### Biến thể thứ hai, phát hiện khi đánh giá #155 (2026-08-26): chính người gửi cũng có thể kẹt

Đọc `GameHandler.js:82-91`: nếu **ack bị rớt**, client timeout → retry cùng `moveId` → server nhận
diện trùng và **replay `game:moved` trực tiếp cho đúng socket đó** (không qua broadcast lại) — nên
case "ack rớt" đã có đường tự phục hồi, không phải lo.

Nhưng nếu **ack thành công** (client nhận `{ok}` bình thường) mà chính gói `game:moved` broadcast
cho **người vừa đi** lại rớt độc lập (2 gói khác nhau trên cùng kết nối, rớt độc lập được — đúng mô
hình rớt gói chọn lọc của GFW mà #152/#154 đang giả định) — thì **không có gì kích hoạt retry** (retry
chỉ chạy khi ack timeout, xem `game-ui.js` `sendMove`), nên `optimisticStone` (#153) không bao giờ
được reconcile. Đây là cùng lớp bug với deadlock ở trên (mất gói không có sự kiện đánh thức), chỉ
khác ở **phía nào bị kẹt** — người nhận (mô tả gốc ở trên) hay chính người gửi (biến thể này).

Với #153 một mình, hậu quả nhẹ: quân pending kẹt mãi ở dạng mờ/viền nét đứt — khó chịu nhưng không
sai lệch. Với #155 (`docs/todo/B155-*.md` — nâng optimistic thành Full CSP, thêm overlay
`predictedTurn` cho turn-bar/đồng hồ), hậu quả nặng hơn: turn-bar + đồng hồ đối thủ cũng kẹt mãi ở
trạng thái dự đoán, không có tín hiệu gì báo cho người chơi — im lặng hơn, nên **ưu tiên xử lý biến
thể này cùng đợt với #154 gốc**, hoặc chốt trước khi #155 được coi là an toàn để ship.

## Chặn trên hiện có

Người kẹt vẫn đang là lượt đi trên server nên đồng hồ chạy hết và họ **thua giờ**. Không treo vĩnh
viễn, nhưng thua một ván đang tốt vì một gói tin rớt — vẫn là hỏng ván.

## Hướng cần cân nhắc (chưa chốt — thảo luận trước khi code)

- **Watchdog theo lượt phía client**: nếu tin rằng đang là lượt đối thủ mà quá N giây không có
  `game:moved` nào, gọi `game:resync`. Rẻ, tái dùng đúng primitive #152 đã dựng. Rủi ro: chọn N sai
  ⇒ resync ồn ào ở mọi ván nghĩ lâu (mà nghĩ lâu là bình thường trong cờ). Có thể gắn N theo đồng hồ
  còn lại thay vì hằng số — **phải đo trước, đừng chọn số tròn** (bài học #131).
- **Broadcast đồng hồ định kỳ** từ server để làm nhịp tim mang theo `moveCount`. Tốn băng thông cho
  mọi ván để cứu một trường hợp hiếm; cân nhắc kỹ.

**Đừng** giải quyết bằng cách siết `pingInterval`/`pingTimeout` — đã bị loại khỏi phạm vi ở #152 vì
rủi ro false disconnect trên chính mạng mất gói của nhóm người dùng này.

## Liên quan

- **#152** — `docs/todo/B152-game-move-khong-co-ack-timeout-retry-gay-freeze.md`. Chiều "người đi"
  đã xong (ack + timeout + retry + resync); đây là phần còn lại của chiều "người nhận" (và, theo
  biến thể mới phát hiện ở trên, một khe hở còn sót của chính chiều "người đi" trong case ack-ok-
  nhưng-broadcast-rớt).
- **#155** — `docs/todo/B155-full-csp-am-thanh-luot-di-tuc-thi-0ms.md`. Không xung đột code (khác
  tầng: #154 là phát hiện mất gói, #155 là cảm nhận độ trễ) nhưng biến thể thứ hai ở trên làm hậu quả
  của #154 chưa-làm nặng hơn sau khi #155 ship — xem instruction.md B155 phần "Rủi ro còn sót".
- `game:resync` (primitive do #152 dựng) là thứ mọi hướng ở trên sẽ dùng lại — không cần dựng mới.
