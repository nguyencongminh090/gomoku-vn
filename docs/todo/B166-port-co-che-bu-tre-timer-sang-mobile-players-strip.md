# B166 — Port cơ chế bù trễ timer + `predictedTurn` xuống mobile players-strip

**Trạng thái:** ✅ Đã sửa (2026-08-28, `fix/timer-delay-mobile-players-strip` off `dev`) — B165 đã
xong, cơ chế bù trễ đã chốt (half-RTT trừ khỏi *giá trị hiển thị* trong `tickLocal`/`applyTimerSync`,
đã nằm sẵn trong `st.timerValues`), B166 chỉ nhân bản overlay `predictedTurn` + đọc chung nguồn giá
trị đó xuống 2 hàm mobile.

## Đã làm

1. Tách 2 helper chung trong `client/js/game-ui.js`, export trên `GameUI`:
   - `effectiveTimerValues()` → `{ black, white }`: `st.timerValues` (đã bù trễ #165) + overlay
     `predictedTurn` #155 (mover frozen ở snapshot, đối thủ đếm ngược từ snapshot).
   - `effectiveTurnColor()` → `'BLACK' | 'WHITE' | null`: `predictedTurn.forColor` khi in-flight,
     nếu không thì `currentTurn` + luật placeholder Swap2 §B37.
   `renderTimers` (desktop turn-bar) nay gọi đúng 2 helper này thay cho code inline cũ — hành vi
   desktop không đổi.
2. `client/js/room-ui.js`:
   - `renderStripPlayer` (`isTurn` / `players-strip__track--idle`) đọc `effectiveTurnColor()` qua
     wrapper `stripTurnColor()` (degrade về `currentTurn` nếu `GameUI` chưa nạp).
   - `updateStripTimers` đọc `effectiveTimerValues()` qua `stripTimerValues()`; đồng thời chuyển
     `players-strip__slot--turn` / `players-strip__track--idle` trên đường tick mỗi giây (không chỉ
     lúc `renderPlayersStrip` rebuild) → strip lật sang đối thủ NGAY khi `predictedTurn.active`.
   - Export thêm `renderPlayersStrip` trên `RoomUI` (cho test).
   - `predictedTurn` render-only, không bao giờ ghi `gameState`.
3. `visibilitychange`/`focus` re-sync của B165 (mục 3) repaint players-strip "miễn phí": nó gọi
   `requestResync()` → `applyTimerSync` → `GameUI.renderTimers()` → `RoomUI.updateStripTimers()`.
4. Bump `?v=164 → 165` toàn `client/` (grep xác nhận đúng 1 giá trị).
5. Test: `client/tests/room-ui-strip-predicted-turn.test.js` (+6 case): overlay lật turn ngay
   (cả đường rebuild lẫn đường tick), số strip khớp cùng nguồn giá trị với turn-bar, `halfRttMs 0`
   + không `predictedTurn` ⇒ không đổi so với trước fix, ván kết thúc ⇒ không row nào bị đánh dấu
   turn. `npm test` **1471/1471**.

## Ghi chú phạm vi

- Không đụng desktop turn-bar *behaviour* — chỉ refactor code chung ra helper.
- `tournament-match.js` vẫn giữ bản sao timer riêng, cố ý hoãn (đã ghi ở B165).
- `formatStripTime` (M:SS, `Math.floor`) vs `formatTime` (giây trần, có thể `round`) — khác biệt
  *hiển thị* có chủ đích từ trước, không phải lệch giá trị; cả hai đọc chung 1 nguồn số.

---

## (Bối cảnh gốc — giữ nguyên)

⬜ CHƯA LÀM (ghi nhận 2026-08-28) — **phụ thuộc B165**, làm sau khi B165 chốt cơ chế.

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
