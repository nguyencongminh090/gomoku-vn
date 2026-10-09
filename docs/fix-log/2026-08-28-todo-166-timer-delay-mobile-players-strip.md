# Fix log entry — 2026-08-28 09:01

## Prompt

"Do #166" — TODO.md #166: port cơ chế bù trễ timer + overlay `predictedTurn`
của #165 (desktop turn-bar) xuống **mobile players-strip**. Phụ thuộc #165 (đã
xong cùng ngày). Chỉ nhân bản, không tự thiết kế cơ chế mới.

## Action

Gốc: `client/js/room-ui.js` `renderStripPlayer` (`room-ui.js:236`) và
`updateStripTimers()` (`room-ui.js:330`) đọc thẳng `gameState.currentTurn` +
`st.timerValues`, không đọc `predictedTurn` — trên mobile, turn marker và
countdown của người vừa đi đợi trọn RTT (đúng lag mà #155 đã bỏ cho desktop),
và sau #165 còn dư thêm phần transit delay mà turn-bar đã bắt đầu trừ.

- `client/js/game-ui.js`: tách 2 helper chung, export trên `GameUI`:
  - `effectiveTimerValues()` → `{ black, white }` — `st.timerValues` (đã mang
    sẵn bù trễ #165 do `tickLocal`/`applyTimerSync` ghi) + overlay
    `predictedTurn` #155 (mover frozen ở `snapshotTimerValues`, đối thủ đếm
    ngược từ đó).
  - `effectiveTurnColor()` → `'BLACK' | 'WHITE' | null` — `predictedTurn.forColor`
    khi in-flight; nếu không thì `currentTurn` + luật placeholder Swap2 §B37.
  - `renderTimers` (desktop) nay gọi đúng 2 helper này thay code inline cũ —
    hành vi desktop không đổi, chỉ hết nhân đôi công thức.
- `client/js/room-ui.js`:
  - `renderStripPlayer`: `isTurn` / `players-strip__track--idle` đọc
    `stripTurnColor()` (wrapper quanh `GameUI.effectiveTurnColor()`, degrade về
    `currentTurn` nếu `GameUI` chưa nạp).
  - `updateStripTimers`: số đọc `stripTimerValues()` (wrapper quanh
    `effectiveTimerValues()`); và chuyển marker `players-strip__slot--turn` /
    `players-strip__track--idle` NGAY trên đường tick mỗi giây (qua
    `trackEl.previousElementSibling`), không chờ `renderPlayersStrip` rebuild —
    strip lật sang đối thủ ngay khi `predictedTurn.active`.
  - Export thêm `RoomUI.renderPlayersStrip`.
  - `predictedTurn` render-only, không ghi `gameState`.
- `visibilitychange`/`focus` re-sync của B165 repaint strip miễn phí:
  `requestResync()` → `applyTimerSync` → `GameUI.renderTimers()` →
  `RoomUI.updateStripTimers()`.
- Bump `?v=164 → 165` toàn `client/` (grep: đúng 1 giá trị).

## Decision

- Bù trễ #165 KHÔNG cần nhân bản riêng cho mobile: nó đã được `tickLocal`/
  `applyTimerSync` trừ trực tiếp vào `st.timerValues` phía room-socket.js, nên
  mọi bề mặt đọc `st.timerValues` (hoặc `snapshotTimerValues`, chụp sau
  `refreshLocalTimer`) đều thừa hưởng. Việc còn thiếu ở mobile thuần là overlay
  `predictedTurn`.
- Tách helper chung (thay vì copy công thức) theo instruction B166 "đừng để
  mobile/desktop lệch nhau".
- `formatStripTime` (M:SS, `Math.floor`) vs `formatTime` (giây trần) là khác
  biệt *hiển thị* có chủ đích từ trước — không đụng; cả hai đọc chung 1 nguồn số.
- `tournament-match.js` giữ bản sao timer riêng, cố ý hoãn (đã ghi ở B165).
- Không đụng desktop turn-bar behaviour.
- Entry tracking #165/#166 chỉ có trên `dev` ⇒ `fix/timer-delay-mobile-players-strip`
  off `dev`, merge vào `dev`.

## Summary output

`fix/timer-delay-mobile-players-strip` off `dev`. +6 case
`client/tests/room-ui-strip-predicted-turn.test.js` (overlay lật turn cả đường
rebuild lẫn tick; số strip cùng nguồn với turn-bar; `halfRttMs 0` + không
`predictedTurn` ⇒ không đổi; ván kết thúc ⇒ không row nào bị đánh dấu turn).
`npm test` **1471/1471**. `?v=164→165`.
