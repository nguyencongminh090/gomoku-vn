# B166 — Port cơ chế bù trễ timer + `predictedTurn` xuống mobile players-strip

**Trạng thái:** ⬜ CHƯA LÀM (ghi nhận 2026-08-28) — **phụ thuộc B165**, làm sau khi B165 chốt cơ chế.

**Severity:** Low/Medium — bất nhất giữa hai bề mặt của cùng tính năng: desktop turn-bar tức thì +
bù trễ (sau B165), mobile players-strip vẫn đợi trọn RTT và vẫn nhảy đồng hồ.
**Platform:** Mobile / màn hình ≤768px (`room.html` players-strip nằm trên bàn cờ).
**Pages affected:** `room.html` mobile.
**Reported by:** Phát hiện khi thực thi #155 (đã ghi trong `docs/todo/B155-*.md` phần "Ngoài phạm
vi"), người dùng xác nhận 2026-08-28: "Lỗi mobile vẫn ghi nhận, nhưng làm lỗi desktop trước và đồng
bộ cơ chế đã hoàn thiện qua mobile."

---

## Bối cảnh

`instruction.md` B155 chỉ nêu `game-ui.js` `updateBoardState()`/`renderTimers()` (desktop turn-bar).
Hai điểm sau ở mobile **không đọc `predictedTurn`**, đọc thẳng state authoritative:

- `renderStripPlayer` (`client/js/room-ui.js:236`) — `isTurn` / `players-strip__track--idle` lấy từ
  `gameState.currentTurn`.
- `updateStripTimers()` (`client/js/room-ui.js:330`) — repaint số mỗi giây từ `st.timerValues`.

Kết quả hiện tại (và sau B165 sẽ càng lệch): ở mobile, turn + countdown của người vừa đi đợi trọn
RTT y hệt trước #155; và nếu B165 thêm bù transit delay cho desktop, mobile vẫn nhảy 13→10.

---

## Việc cần làm (chi tiết ở `instruction.md` B166 — viết sau khi B165 xong)

1. Cho `renderStripPlayer` + `updateStripTimers` đọc `predictedTurn` overlay **cùng nguyên lý B155**:
   overlay render-only, **không bao giờ ghi `gameState`**.
2. Áp **đúng cơ chế bù trễ đã chốt ở B165** (half-RTT trừ khỏi deadline / ease correction) xuống
   đường mobile — không tự nghĩ cơ chế khác, copy từ B165.
3. Đảm bảo `visibilitychange`/`focus` re-sync (B165 mục 3) cũng repaint players-strip.
4. Test client mở rộng cho hai hàm trên (client hiện có `client/tests/` cho room-ui).
5. Bump `?v=N`.

---

## Liên quan

- **#165** (`docs/todo/B165-timer-nhay-do-transit-delay-predictedturn-desktop.md`) — tiền đề; B166
  chỉ nhân bản cơ chế đã hoàn thiện.
- **#155** (`docs/todo/B155-full-csp-am-thanh-luot-di-tuc-thi-0ms.md`) — nguồn phát hiện gốc.
