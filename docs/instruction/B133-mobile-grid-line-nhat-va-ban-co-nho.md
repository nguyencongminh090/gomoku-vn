# B133 — Hướng dẫn triển khai

Hai phần độc lập, có thể làm tách nhau (khác file, khác nguyên nhân).

## Phần 1: Grid line nhạt màu

Vị trí: `client/js/board.js:586-588`.

- **Chờ người dùng tự chốt giá trị alpha mới** trước khi sửa — người dùng nói "Tôi sẽ tự check
  UI", đừng tự chọn số (vd 0.35, 0.4...) rồi coi B133 phần 1 là xong.
- Khi có số cụ thể: chỉ đổi alpha trong nhánh `else` (không phải `stone`), giữ nguyên nhánh
  `stone` (`rgba(34, 28, 17, 0.55)`) — người dùng không phàn nàn về chế độ đó.
- `_theme.accentRgb` là biến theme-aware (đổi theo skin/dark-light) — không hardcode RGB mới, chỉ
  đổi số alpha cuối.
- Kiểm tra lại cả 2 chế độ hiển thị (standard và caro nếu dùng chung nhánh `else`) không bị chói/mất
  cân bằng với stone/quân cờ sau khi đổi — verify bằng mắt trên thiết bị thật hoặc DevTools mobile
  viewport, không chỉ đọc số.

## Phần 2: Bàn cờ nhỏ trên mobile

Vị trí: `client/js/board.js`'s `resize()`, dòng 203-231 + `client/css/room-zen.css:898-906`
(`.board-area-shell` mobile padding).

- **Trước khi sửa số**: xác minh bằng console log/debugger thực tế từng số hạng trừ trong
  `viewportBudget` (dòng 228-229) trên 1 thiết bị mobile thật hoặc DevTools responsive mode — đo
  xem `padY` (đã trừ ở số hạng riêng) có bị trừ **lần 2** qua khối `14 + 16 + 12 + 8` hay không.
  Đây là nghi vấn double-count, chưa xác nhận — bình luận tại chỗ (dòng 188-190) nói rõ 4 số đó là
  "outer padding + inner padding + margin + safety" của skin **non-zen**, còn nhánh này chạy khi
  `document.body.classList.contains('zen-room')` (dòng 222) — cần xác nhận tái dùng có chủ đích
  (safety margin) hay là copy nhầm.
- Nếu xác nhận double-count: bớt phần trùng, **không xoá trắng** toàn bộ safety margin — vẫn cần
  chừa margin cho turn-bar/controls không bị đẩy khỏi màn hình trên máy thấp.
- Đối chiếu với hành vi desktop đã đúng (`--zen-board-gutter: 0px`, gần như không padding) — mục
  tiêu là mobile tiệm cận cùng triết lý "bàn cờ tràn viền" trong giới hạn còn chỗ cho turn-bar +
  game-controls + bottom tab bar, không phải sao chép y hệt desktop (mobile còn `--zen-bar-h` bottom
  sheet mà desktop không có).
- `client/js/` không có test tự động (theo `CLAUDE.md`) — verify bằng Playwright/DevTools thật trên
  viewport hẹp (iPhone SE 375px và 1 màn lớn hơn ~414px), đo `canvas` computed width trước/sau, không
  chỉ nhìn ảnh chụp.
- Không đụng nhánh `singleColumn`/non-zen (dòng 238+) — B133 chỉ về zen room (skin mặc định hiện
  tại của `room.html`).

## Chung cho cả 2 phần

- Nếu sửa `client/css/room-zen.css` hoặc `client/js/board.js`: bump `?v=N` toàn repo theo
  `CLAUDE.md`, verify bằng `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` phải ra
  đúng 1 giá trị.
