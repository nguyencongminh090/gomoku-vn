# B133 — Mobile: đường kẻ bàn cờ nhạt màu + bàn cờ nhỏ

**Nguồn:** báo cáo trực tiếp người dùng qua chụp màn hình mobile ("Line is light and board is
small" / "đường kẻ (grid) trong bàn nhạt màu và bàn cờ nhỏ") kèm ảnh so sánh desktop (bàn cờ tràn
viền tốt) và devtools element inspector.

**Trạng thái:** Chưa làm — chỉ mới phân tích nguyên nhân, người dùng tự kiểm tra UI phần màu sắc
trước khi chốt hướng sửa.

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

### 2. Bàn cờ nhỏ trên mobile — do padding tích luỹ qua nhiều lớp, không phải 1 chỗ

Người dùng tự nhận định đúng hướng: "Bàn cờ nhỏ do padding (board-area)". Vết cụ thể trong
`client/js/board.js`'s `resize()`:

- Desktop: `--zen-board-gutter: 0px` (`room-zen.css:84`) — `.board-area-shell` gần như không có
  padding, khớp với quan sát "bàn cờ trên máy tính đã làm tốt việc phóng tràn viền".
- Mobile (`@media max-width: 768px`, `room-zen.css:898-906`): `.board-area-shell` có
  `padding: 10px 8px calc(var(--zen-bar-h) + 10px)`.
- `resize()` (`board.js:203-231`) cộng dồn thêm nhiều khoản trừ cho bàn cờ mobile trong zen room:
  - `maxVw = Math.min(shellWidth - 8, window.innerWidth - 8)` (dòng 207-209) — trừ thêm 8px ngoài
    padding shell đã trừ.
  - `viewportBudget = window.innerHeight - shellTop - padY - tbH - gcH - 14 - 16 - 12 - 8` (dòng
    228-229) — 4 số hạng cuối (`14, 16, 12, 8` = 50px) là **budget phẳng của skin non-zen** (bình
    luận dòng 188-190 xác nhận đây là "outer padding/border (14px) + inner padding (16px) + ... +
    safety (8)"), có vẻ bị tái dùng nguyên trong nhánh tính `viewportBudget` cho zen room dù zen đã
    tự trừ padding thật (`padY`) ở số hạng ngay trước — cần xác minh có phải double-count hay đây là
    safety margin cố ý trước khi sửa.

## Không thuộc phạm vi B133 (không tự mở rộng)

- Không tự đổi giá trị alpha/màu — người dùng nói rõ "Hãy thử nâng màu grid lên cao hơn. Tôi sẽ tự
  check UI", nghĩa là hướng sửa (giá trị alpha mới) cần người dùng tự duyệt UI trước khi chốt số,
  không phải Claude tự chọn số rồi coi là xong.
- Không tự sửa công thức `resize()` — cần đo lại từng số hạng trừ (đặc biệt 4 số `14/16/12/8` có
  đang double-count với `padY` hay không) trước khi đổi, tránh lặp lại kiểu bug "sửa lớp triệu
  chứng, không sửa lớp gốc" đã có tiền lệ trong `docs/fix-log.md`.

— [hướng dẫn triển khai](../instruction/B133-mobile-grid-line-nhat-va-ban-co-nho.md)
