# #128 — Thêm tính năng Undo (hoàn tác nước đi) trong `room.html`

**Trạng thái:** ✅ ĐÃ XONG (2026-08-15, `feature/undo` off `dev`).

Triển khai đủ theo 9 quyết định đã chốt + thuật toán `targetIndex`/khai cuộc ở
`docs/instruction/B128-*.md`:
- `GameEngine.js`: `requestUndo`/`acceptUndo`/`declineUndo`, thuật toán rollback `targetIndex`
  (chốt lúc gửi yêu cầu, không tính lại lúc accept), auto-cancel có điều kiện (chỉ khi chính người
  yêu cầu đi tiếp) trong cả `makeMove()`/`placeOpeningStone()`/`swap2Choice()`, snapshot-stack
  (`openingSnapshots`) cho luật khai cuộc "lùi 1 hành động", `playPhaseStartIndex` làm ranh giới
  cứng giữa khai cuộc và chơi thường, thêm `undoOffer` vào `serialize()`.
- `GameHandler.js`: `game:undo_request`/`game:undo_accept`/`game:undo_decline` +
  `game:undo_applied` (payload xoá ô, khác `game:moved`) cho chế độ `play`; tái dùng
  `game:swap2_state` cho chế độ `opening` (không cần payload mới); `movePayload.undoCancelled`/
  `swap2State.undoCancelled` báo cho client biết khi auto-cancel xảy ra; timer:
  `timer.switchTurn()` cho cả 2 chế độ, `timer.remapForSwap2()` gọi lại để đảo ngược khi
  colorsAssigned true→false.
- Client (`game-ui.js`/`room-socket.js`/`i18n.js`/`game.css`): nút "Xin đi lại" (cả trong
  `renderGameControls()` và `renderSwap2()`), `#undo-prompt-area` + `renderUndoPrompt()`, xử lý
  `undoCancelled` để tự xoá prompt cũ, reconnect hiện lại đúng yêu cầu đang chờ qua
  `gameState.undoOffer` (`room:joined`/`game:init`).

**Test:** 23 unit test mới trong `server/tests/GameEngine.test.js` (13 chế độ `play`, 10 chế độ
`opening`/Swap2 — bao phủ cả trường hợp xin lúc đối thủ chưa đáp trả, xin sau khi đã đáp trả, xin
xuyên phase con, xin xuyên ranh giới `play`, stacked undo, auto-cancel có điều kiện, reject khi chưa
có nước). `npm test` 1185/1185. Xác minh trực tiếp bằng Playwright thật (`e2e/undo.spec.ts`, 6 test,
2 trình duyệt thật, server cô lập cổng 3901 + db tạm — không đụng server/db thật đang có người chơi
thật) — cả 6 test pass: xin lúc chưa đáp trả (xoá 1 nước), xin sau khi đáp trả (xoá 2 nước), từ
chối, đối thủ đi tiếp không huỷ yêu cầu, người xin tự đi tiếp auto-cancel, khai cuộc Swap2 (đối thủ
không đặt quân vẫn xin được, xoá đúng 1 quân).

**Giới hạn đã biết, chưa xác minh bằng Playwright thật:** trường hợp hẹp "hủy đúng lựa chọn màu cuối
cùng đóng khai cuộc" (đảo ngược `timer.remapForSwap2()`) chỉ có unit test ở tầng `GameEngine`
(đúng `openingPhase`/`colorsAssigned`/board), **chưa** xác minh riêng hành vi đồng hồ thật qua trình
duyệt cho đúng case này — rủi ro thấp (case rất hẹp: phải hủy ngay tức khắc sau lựa chọn cuối, trước
khi có nước cờ thật nào), nhưng nên lưu ý nếu có báo lỗi liên quan đồng hồ sau khi hủy chọn màu.

**Nguồn:** yêu cầu người dùng, 2026-08-15 ("Scope: Room. Add Undo function."). Đã thảo luận đầy đủ
qua `features/undo/` (`user_story.md` + `planning.md`, 9 quyết định thiết kế đã chốt qua 2 vòng hỏi
đáp) trước khi ghi vào đây, theo quy tắc "features/<slug>/" trong `CLAUDE.md`.

## Yêu cầu

Người chơi trong `room.html` có thể xin hoàn tác nước đi; đối thủ phải đồng ý mới được áp dụng
(không phải hoàn tác ngay lập tức/đơn phương).

## Các quyết định thiết kế đã chốt (xem chi tiết + lý do đầy đủ ở `features/undo/`)

1. **Đối thủ phải đồng ý** — theo đúng khuôn mẫu `offerDraw`/`acceptDraw`/`declineDraw`
   (`GameEngine.js:439-489`), không phải khuôn mẫu tự động cấp có hạn mức của `game:request_time`.
2. **Phạm vi: chỉ `room.html`** (phòng thường) — **không** áp dụng cho trận đấu giải đấu
   (`TournamentMatchHandler.js`).
3. **Không giới hạn số lần** — mỗi lần chỉ cần đối thủ đồng ý, không có hạn mức/bộ đếm.
4. **Quy tắc lõi (nguyên văn người dùng):** *"Undo to requester turn (đi lại ở lượt cuối cùng của
   người yêu cầu)"* — Undo được chấp nhận luôn đưa trạng thái về **ngay trước nước đi gần nhất của
   chính người yêu cầu**, đưa lượt về lại người yêu cầu. Nếu đối thủ đã đáp trả, nước đáp trả đó
   cũng bị xoá theo (trường hợp "1 round đầy đủ"); nếu đối thủ chưa kịp đi, chỉ xoá đúng 1 nước của
   người yêu cầu. Một quy tắc duy nhất, không có trường hợp đặc biệt riêng — xem thuật toán
   `targetIndex` suy ra ở `features/undo/planning.md` mục "Core rule".
5. **Được phép xin Undo bất cứ lúc nào**, kể cả khi đang là lượt đối thủ (đối thủ chưa đáp trả) —
   không bắt buộc phải đợi hết 1 round mới được xin.
6. **Vẫn cho phép trong giai đoạn khai cuộc Swap2** (`openingPhase !== 'play'`) — **chưa thiết kế
   xong cơ chế cụ thể** (giai đoạn này không dùng `moveHistory`/`makeMove()` theo cách thông thường:
   place3 đặt 3 quân trong 1 hành động, p1choice/p2choice là lựa chọn chứ không phải đặt quân) — cần
   thiết kế riêng lúc triển khai, xem `docs/instruction/B128-*.md`.
7. **Đồng hồ:** chỉ chế độ `per_move` được khôi phục (thực ra không cần code mới — `per_move` vốn
   đã reset về đầy mỗi nước đi); `blitz`/`per_game` **không** trả lại thời gian đã dùng/increment đã
   cộng.
8. **Khi mất kết nối:** yêu cầu đang chờ **không bị huỷ**, nhưng khi người kia reconnect **phải**
   vẫn thấy yêu cầu đó — cần thêm field `undoOffer` vào `GameEngine.serialize()` (hiện tại
   `drawOffer` **không** có trong `serialize()` — đây là khoảng trống có sẵn, Undo phải tự đóng chứ
   không dựa theo tiền lệ).
9. **Không chặn luồng chơi:** đối thủ vẫn được đi tiếp trong lúc yêu cầu đang chờ, và yêu cầu **vẫn
   giữ hiệu lực** (áp dụng đúng nhờ snapshot `targetIndex` lúc gửi yêu cầu). Yêu cầu chỉ tự huỷ khi
   **chính người yêu cầu** đi thêm 1 nước — khác với `drawOffer` (bị xoá vô điều kiện ở bất kỳ nước
   đi nào của bất kỳ ai, `GameEngine.js:216`).

## Việc cần làm khi triển khai (xem `docs/instruction/B128-*.md` để biết trình tự đề xuất)

- `server/managers/GameEngine.js`: `requestUndo`/`acceptUndo`/`declineUndo` + thuật toán rollback
  theo `targetIndex`; auto-cancel có điều kiện (chỉ khi người đi tiếp là chính người yêu cầu) trong
  `makeMove()`; thêm `undoOffer` vào `serialize()`.
- `server/socket/handlers/GameHandler.js`: `game:undo_request`/`game:undo_accept`/
  `game:undo_decline` + broadcast mới `game:undo_applied` (payload xoá ô, không phải điền ô như
  `game:moved`) + dòng chat hệ thống ("X xin đi lại." / đồng ý / từ chối).
- Thiết kế riêng cho Undo trong giai đoạn Swap2 (quyết định #6).
- Client: listener mới, UI xin/chấp nhận/từ chối, render xoá ô bàn cờ, đồng bộ move-tree/history nếu
  có.
- Bump `?v=N` theo `CLAUDE.md` cho mọi thay đổi `client/css`/`client/js`.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Rủi ro:** trung bình — đụng logic lõi `GameEngine` (bàn cờ, lượt đi, đồng hồ), dễ để lọt race
  condition nếu không viết test cho các trường hợp "đối thủ đi tiếp trong lúc đang chờ".
- **Test:** unit test server-side bắt buộc (`server/tests/GameEngine.test.js`, pattern-match theo
  `offerDraw`/`acceptDraw`/`declineDraw`); có `client/` surface nên còn cần xác minh trực tiếp bằng
  trình duyệt thật (2 tab) theo checklist hoàn thiện tính năng trong `CLAUDE.md`, không chỉ test
  backend.

Chi tiết thực thi: [docs/instruction/B128-them-tinh-nang-undo-hoan-tac-nuoc-di-o-room-html.md](../instruction/B128-them-tinh-nang-undo-hoan-tac-nuoc-di-o-room-html.md).
