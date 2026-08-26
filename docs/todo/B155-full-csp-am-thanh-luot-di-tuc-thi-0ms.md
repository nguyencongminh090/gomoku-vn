# B155 — Full Client-Side Prediction: âm thanh + turn-bar/timer tức thì 0ms (nối tiếp #153)

**Trạng thái:** ✅ ĐÃ XONG (2026-08-26, `feature/full-csp-zero-latency` off `dev`, `?v=155`). Quân
predicted solid 100% (`board.js` `_drawOptimisticStone`), âm thanh tức thì + khử trùng lặp
(`game-ui.js` `sendMove`, `room-socket.js` `game:moved`), `predictedTurn` overlay mới (`RoomState`,
sibling của `boardRenderer`, không ghi `gameState`) cho turn-bar/đồng hồ đối thủ đếm ngược sống, local
pre-check tối thiểu ở `onCellClick`. Rollback qua mọi đường (ack lỗi, timeout→resync, `game:ended`
đua) chỉ tắt cờ — dùng lại nguyên lý #153. 27 test mới/mở rộng theo ma trận 13 case ở
`features/full-csp-zero-latency/planning.md` Q3, `npm test` 1356/1356 xanh. Verify thủ công bằng
Playwright 2 người thật (không phải chỉ unit test): xác nhận cả nhánh confirm (di chuyển hợp lệ, quân
solid + turn-bar đổi ngay khi click, snap đúng khi `game:moved` về) và nhánh rollback (di chuyển bị
server từ chối — luật "nước đầu cạnh tường" — quân + turn-bar tự phục hồi đúng, không cần logic khôi
phục riêng). Hai chỗ lệch nhỏ so với văn bản `instruction.md` gốc (xem chi tiết trong đó): (1) local
pre-check so `gameState.currentTurn` với `myUser.userId` (đúng theo field thật, không phải so màu
như bản nháp ghi), (2) `predictedTurn.snapshotTimerValues` lấy từ `RoomState.timerValues` (đúng field
thật giữ đồng hồ) chứ không phải `gameState.timerValues` (field đó không tồn tại).

**Severity:** Low/Medium (cải thiện cảm nhận độ trễ, không phải bug — #153 đã che phần lớn RTT rồi)
**Platform:** Mọi nền tảng — nặng tỉ lệ thuận với RTT, rõ nhất trên kết nối 150-200ms (báo cáo gốc:
người chơi Trung Quốc)
**Pages affected:** `room.html` (bàn cờ khi đang chơi)
**Reported by:** Người dùng — đưa một bản spec kỹ thuật bên ngoài (AI-generated, phong cách
Lichess/Chess.com Zero-Perceived-Latency) để đánh giá, 2026-08-26. Sau đánh giá + thảo luận rủi ro,
người dùng chấp nhận đánh đổi UX và chốt 1 câu hỏi mở còn lại (xem `docs/instruction/B155-*.md`).
Toàn bộ quá trình thảo luận thiết kế nằm ở `features/full-csp-zero-latency/` (đọc trước khi code).

---

## Bối cảnh — #153 đã làm gì, còn thiếu gì

TODO.md #153 (✅ đã xong 2026-08-24) đã thêm `BoardRenderer.optimisticStone`: quân bán trong suốt
(50% alpha) + viền nét đứt, vẽ ngay khi click, hoà giải theo `game:moved` khớp toạ độ. Đây là bước
đúng hướng nhưng **chỉ che phần thị giác một phần**:

- Quân pending **nhìn khác** quân thật (chủ đích của #153, để không nhầm "đã gửi" với "đã chốt") —
  nhưng vẫn để lộ việc "chưa xác nhận" ra mắt người chơi.
- **Âm thanh đặt quân** (`audioManager.playMoveSound`) vẫn đợi `game:moved` broadcast về mới phát —
  tức là vẫn nguyên RTT cho phần nghe, dù phần nhìn đã được che.
- **Turn-bar + đồng hồ đối thủ** vẫn đợi `gameState.currentTurn` cập nhật từ server mới đổi — người
  vừa đi vẫn thấy thanh lượt của chính mình sáng thêm một khoảng RTT sau khi đã bấm.

Người dùng đưa spec ngoài yêu cầu nâng cấp cả ba điểm còn lại (quân solid 100%, âm thanh tức thì,
turn-bar/timer tức thì) — tức "Full CSP" theo đúng nghĩa Lichess/Chess.com, không chỉ optimistic
overlay riêng quân cờ.

---

## Việc cần làm (tóm tắt — chi tiết kỹ thuật ở `instruction.md` B155)

1. **`client/js/board.js`**: `_drawOptimisticStone` vẽ solid 100% opacity, không còn viền nét đứt —
   không phân biệt được với quân đã xác nhận bằng mắt thường.
2. **`client/js/game-ui.js` (`sendMove`)**: phát âm thanh đặt quân ngay tại thời điểm click (không
   đợi ack/broadcast); thêm overlay **mới** `predictedTurn` (render-only, tách biệt hoàn toàn khỏi
   `gameState`, xem `instruction.md` mục thiết kế) để turn-bar + đồng hồ đối thủ chuyển ngay lập tức,
   đồng hồ **chạy đếm ngược sống** (live tick — quyết định người dùng, không phải highlight tĩnh).
3. **`client/js/room-socket.js` (`game:moved`)**: khử trùng âm thanh cho nước đi của chính mình (đã
   phát ở bước 2, không phát lại); khi confirm, **snap** timer về đúng số server trả (không giữ số
   đếm dự đoán) để tránh trôi lệch tích luỹ.
4. **Rollback** (ack `{error}`, ack-timeout-2-lần → resync, hoặc `game:ended` đua với ack đang chờ):
   gỡ `optimisticStone` + gỡ `predictedTurn` (chỉ cần tắt cờ, không cần khôi phục snapshot vì
   `gameState` gốc chưa từng bị ghi đè — nguyên lý giống #153).
5. **Local pre-check tối thiểu** trước khi optimistic (ô trống + đúng lượt + game đang `ongoing`,
   theo dữ liệu client **đã có sẵn**) — chặn sớm các trường hợp chắc chắn sai, đỡ tốn 1 round-trip vô
   ích. **Không** thêm check tường/portal — client không có dữ liệu đó và không được nhân bản logic
   server.
6. Test mới/mở rộng `client/tests/board-optimistic-stone.test.js` +
   `client/tests/game-optimistic-render.test.js` theo ma trận 13 case ở
   `features/full-csp-zero-latency/planning.md` Q3.
7. Bump `?v=N`.

---

## Ngoài phạm vi (đã cân nhắc, cố tình không đưa vào task này)

- **Mục 3 của spec gốc (network/transport: `perMessageDeflate: false`, `TCP_NODELAY`)** — bị loại
  khỏi scope B155. Lý do: đây là tinh chỉnh tầng mạng thật (giảm vài chục ms thật), không phải cải
  thiện **cảm nhận** (perception) — spec gốc tự mâu thuẫn khi xếp chung với phần CSP. Ngoài ra
  `perMessageDeflate` là cấu hình **toàn kết nối** socket.io (dùng chung 1 socket cho cả trang, xem
  #145), không thể giới hạn "chỉ gói game nhỏ" như spec đề xuất — tắt nó ảnh hưởng mọi message khác
  (chat, room list...), cần đánh giá riêng, không âm thầm gộp vào đây. Nếu muốn làm, ghi TODO riêng.
- **Thiết kế lại toàn bộ input listener sang `pointerdown`/`mousedown`** thay `click` — chấp nhận về
  nguyên tắc nhưng cần test kỹ trên mobile/touch (dễ đặt nhầm ô khi lướt tay) trước khi đổi hành vi
  click hiện có trên toàn bàn cờ; xem thêm cảnh báo ở `instruction.md`.
- **Phát hiện khi làm (không có trong spec gốc, chưa làm)**: mobile players-strip (`room-ui.js`
  `renderStripPlayer`'s `isTurn`/`players-strip__track--idle`, và `updateStripTimers()`'s per-second
  numeric repaint) đọc thẳng `gameState.currentTurn`/`timerValues`, không đọc `predictedTurn` —
  `instruction.md` B155 chỉ nêu `game-ui.js`'s `updateBoardState()`/`renderTimers()` (desktop turn-bar),
  không nhắc bề mặt ≤768px này. Kết quả: ở mobile, turn/countdown của người vừa đi vẫn đợi trọn RTT
  y hệt trước #155, trong khi desktop đã tức thì — bất nhất giữa hai bề mặt của cùng một tính năng.
  Không sửa trong task này (đúng scope đã ghi trong `instruction.md`); nếu muốn đồng bộ, ghi TODO
  riêng đọc `predictedTurn` tại hai điểm trên, cùng nguyên lý không ghi `gameState`.

---

## Liên quan

- **#153** (`docs/todo/B153-optimistic-render-quan-co-cua-chinh-minh.md`) — nền tảng
  `optimisticStone`, B155 nâng cấp trực tiếp trên đó.
- **#152** (`docs/todo/B152-game-move-khong-co-ack-timeout-retry-gay-freeze.md`) — `moveId`
  idempotency + ack/timeout/retry/resync, **giữ nguyên không đổi**.
- **#154 — ✅ đã sửa 2026-08-26, rủi ro dưới đây đã được bịt.** `armMoveConfirmWatchdog()` (2500ms
  sau ack `{ok}`, chưa thấy `game:moved` khớp toạ độ ⇒ `game:resync`) chính là cơ chế mà mục này đòi
  hỏi, nên B155 dùng chung chứ không dựng thêm; việc còn lại chỉ là cho `predictedTurn` tắt theo đúng
  tín hiệu đang tắt `optimisticStone` — xem mục 6 phần "Chốt" trong `docs/instruction/B155-*.md`.
  Văn bản gốc giữ nguyên bên dưới làm bối cảnh.
- **#154** (`docs/todo/B154-gap-detection-khong-pha-duoc-deadlock-2-nguoi.md`) — **không xung đột
  code** (khác tầng: #154 phát hiện mất gói, #155 cảm nhận độ trễ), nhưng có phụ thuộc rủi ro thật:
  #154 chưa làm ⇒ nếu ack thành công mà chính gói `game:moved` xác nhận nước đi của người vừa đi bị
  rớt độc lập, không có gì kích hoạt reconcile — với #153 một mình chỉ kẹt quân mờ, với #155 sẽ kẹt
  cả turn-bar/đồng hồ ở trạng thái dự đoán vô thời hạn, im lặng không báo. **Không đóng #154** vì lý
  do này — xem "Rủi ro còn sót" trong `docs/instruction/B155-*.md` cho cách #155 tự phòng vệ nếu làm
  trước #154.
- `features/full-csp-zero-latency/` — toàn bộ thảo luận thiết kế, sequence/state diagram, câu hỏi mở
  đã chốt.
