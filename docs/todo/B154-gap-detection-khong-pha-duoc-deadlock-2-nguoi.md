# B154 — Gap detection của #152 không phá được deadlock 2 người khi rớt `game:moved`

**Trạng thái:** Chưa làm

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
  đã xong (ack + timeout + retry + resync); đây là phần còn lại của chiều "người nhận".
- `game:resync` (primitive do #152 dựng) là thứ mọi hướng ở trên sẽ dùng lại — không cần dựng mới.
