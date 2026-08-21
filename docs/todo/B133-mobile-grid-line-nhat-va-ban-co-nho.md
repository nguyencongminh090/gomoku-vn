# B133 — Mobile: đường kẻ bàn cờ nhạt màu + bàn cờ nhỏ

**Nguồn:** báo cáo trực tiếp người dùng qua chụp màn hình mobile ("Line is light and board is
small" / "đường kẻ (grid) trong bàn nhạt màu và bàn cờ nhỏ") kèm ảnh so sánh desktop (bàn cờ tràn
viền tốt) và devtools element inspector.

**Trạng thái:** ✅ Đã sửa 2026-08-21, **2 vòng** (`fix/mobile-board-grid-and-size` off `main`).
Vòng 1: grid line alpha 0.22→0.4 (người dùng đã xem trên máy thật và **xác nhận màu đạt**) + trục
dọc `viewportBudget` bỏ double-count 48px. Vòng 2 (sau khi người dùng đo trên điện thoại thật, thấy
canvas 476 / shell 500): trục **ngang** còn 24px — side padding 8px/bên trong `room-zen.css` mobile
+ `- 8` thừa trong `maxVw` của `board.js`; đã bỏ cả hai cho zen mobile, bàn cờ nay tràn sát mép
(390 viewport → wrap 0–390). Chi tiết đo đạc:
[fix-log](../fix-log/2026-08-21-todo-133-mobile-grid-line-board-size.md).

## #133. Hai vấn đề riêng biệt, cùng do layer khác nhau gây ra

### 1. Đường kẻ (grid line) nhạt màu

`client/js/board.js:586-588` vẽ grid line với alpha cố định thấp:
```js
ctx.strokeStyle = this.displayMode === 'stone'
  ? 'rgba(34, 28, 17, 0.55)'
  : `rgba(${this._theme.accentRgb}, 0.22)`;
```
Chế độ mặc định (standard/caro, không phải `stone`) dùng alpha **0.22** — khá nhạt so với alpha 0.55
của chế độ `stone`. Đây không phải bug riêng của mobile (cùng 1 canvas draw code chạy cả desktop lẫn
mobile), nhưng trên màn hình nhỏ + mật độ điểm ảnh cao, đường kẻ nhạt càng khó thấy hơn tương đối so
với desktop.

**Đã sửa:** alpha 0.22→0.4, nhánh `else` (không đụng nhánh `stone`).

### 2. Bàn cờ nhỏ trên mobile — do padding tích luỹ qua nhiều lớp, không phải 1 chỗ

Người dùng tự nhận định đúng hướng: "Bàn cờ nhỏ do padding (board-area)". Vết cụ thể trong
`client/js/board.js`'s `resize()`:

- Desktop: `--zen-board-gutter: 0px` (`room-zen.css:84`) — `.board-area-shell` gần như không có
  padding, khớp với quan sát "bàn cờ trên máy tính đã làm tốt việc phóng tràn viền".
- Mobile (`@media max-width: 768px`, `room-zen.css:898-906`): `.board-area-shell` có
  `padding: 10px 8px calc(var(--zen-bar-h) + 10px)`.
- `resize()` (`board.js:203-231` gốc) cộng dồn thêm nhiều khoản trừ cho bàn cờ mobile trong zen room:
  - `maxVw = Math.min(shellWidth - 8, window.innerWidth - 8)` (dòng 207-209) — trừ thêm 8px ngoài
    padding shell đã trừ.
  - `viewportBudget = window.innerHeight - shellTop - padY - tbH - gcH - 14 - 16 - 12 - 8` (dòng
    228-229 gốc) — 4 số hạng cuối (`14, 16, 12, 8` = 50px) là **budget phẳng của skin non-zen**
    (bình luận dòng 188-190 gốc xác nhận đây là "outer padding/border (14px) + inner padding (16px)
    + ... + safety (8)"), bị tái dùng nguyên trong nhánh tính `viewportBudget` cho zen room dù zen
    đã tự trừ padding thật (`padY`) ở số hạng ngay trước.

**Đã sửa (vòng 1):** thay `- 14 - 16 - 12 - 8` bằng đúng overhead zen-specific đã tính ở nhánh phía
trên (`canvasWrapBorder=2` + `turnBarMargin`/`controlsMargin` = 10px mỗi cái *chỉ khi* phần tử đó có
chiều cao thật). Xác nhận double-count đúng 48px qua đo Playwright — xem fix-log.

### 2b. Vòng 2 — trục NGANG vẫn còn 24px (người dùng đo trên máy thật, 2026-08-21)

Vòng 1 chỉ chạm trục **dọc** (`viewportBudget`). Người dùng xác nhận lại trên điện thoại thật kèm số
đo DevTools: `.board-area-shell` 500px nhưng `#game-canvas` chỉ 476px — **24px, 12px mỗi bên**. Hai
nguồn, cả hai đều nằm trên trục ngang:

- `room-zen.css` mobile: `.board-area-shell { padding: 10px 8px ... }` + rule
  `.zen-drawer-collapsed .board-area-shell { padding-right: 8px }` (trạng thái **mặc định**) → 16px.
- `board.js`'s `maxVw`: `Math.min(shellWidth - 8, window.innerWidth - 8)` → 8px nữa.
  Số `- 8` này có lý do thật cho skin **non-zen** (bình luận tại chỗ: chống overshoot của mẹo
  full-bleed `width: calc(100% + 32px); margin-left: -16px` trong `room.css`), nhưng
  `room-zen.css` mobile **huỷ đúng mẹo đó** (`width: 100%; margin-left: 0`) nên với zen nó chỉ là
  mất trắng 8px. 16 + 8 = 24, khớp chính xác số người dùng đo.

**Đã sửa (vòng 2):** side padding mobile 8px→0 (cả rule gốc lẫn override `.zen-drawer-collapsed`);
`maxVw` tách nhánh — zen mobile dùng `Math.min(shellWidth, window.innerWidth) - 2` (chỉ trừ hairline
2px của `.board-canvas-wrap`, khớp `canvasWrapBorder` trục dọc), non-zen mobile **giữ nguyên** `- 8`.

## Không thuộc phạm vi B133 (không tự mở rộng)

- Alpha grid line 0.4 là giá trị hợp lý ban đầu, **không phải số người dùng tự chốt** — người dùng
  nói rõ sẽ tự kiểm tra UI, có thể yêu cầu chỉnh lại.
- Không đụng nhánh `focusMode`/`singleColumn` (non-zen) trong `resize()` — ngoài phạm vi báo cáo
  (người dùng chỉ báo trên zen room, skin mặc định hiện tại của `room.html`).
