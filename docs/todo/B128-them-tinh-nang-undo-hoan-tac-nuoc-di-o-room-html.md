# #128 — Thêm tính năng Undo (hoàn tác nước đi) trong `room.html`

**Trạng thái:** chưa làm.

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
