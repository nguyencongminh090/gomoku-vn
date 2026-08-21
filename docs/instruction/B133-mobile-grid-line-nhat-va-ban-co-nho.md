# B133 — Hướng dẫn triển khai

**Đã làm 2026-08-21** — giữ lại phần dưới làm tham chiếu (approach thật đã dùng khớp với dự tính).

Hai phần độc lập, làm tách nhau (khác file, khác nguyên nhân).

## Phần 1: Grid line nhạt màu

Vị trí: `client/js/board.js:586-588`.

- Đã đổi alpha nhánh `else` (không phải `stone`) từ 0.22 → 0.4, giữ nguyên nhánh `stone`
  (`rgba(34, 28, 17, 0.55)`).
- `_theme.accentRgb` là biến theme-aware (đổi theo skin/dark-light) — không hardcode RGB mới, chỉ
  đổi số alpha cuối.
- **Chưa phải giá trị cuối cùng người dùng chốt** — người dùng nói sẽ tự check UI, có thể yêu cầu
  chỉnh lại sau khi xem trực tiếp.

## Phần 2: Bàn cờ nhỏ trên mobile

Vị trí: `client/js/board.js`'s `resize()` (nhánh `viewportBudget`, chạy khi
`mobileWidth && boardAreaShell && zenRoom`) + `client/css/room-zen.css:898-906` (`.board-area-shell`
mobile padding, không sửa — chỉ là nguồn budget đọc vào, không phải nơi có bug).

- Xác nhận double-count: `viewportBudget` cũ trừ `14+16+12+8=50px` (budget non-zen, theo đúng bình
  luận tại chỗ mô tả nó là của skin **non-zen**) trong khi nhánh này chỉ chạy cho `zen-room`. Overhead
  zen thật đã có sẵn ở nhánh `if (zenRoom)` phía trên: `canvasWrapBorder=2` +
  `turnBarMargin`(10 nếu `tbH>0`) + `controlsMargin`(10 nếu `gcH>0`) — dùng lại đúng công thức đó
  thay vì flat 50px.
- Biến `canvasWrapBorder`/`turnBarMargin`/`controlsMargin` khai báo `const` trong scope nhánh
  `if (zenRoom)` phía trên, không with ra được tới nhánh `viewportBudget` (khác block) — phải tính
  lại inline (3 dòng), không refactor hoist ra ngoài (không cần thiết, giữ thay đổi tối thiểu).
- Đã đo xác nhận: viewport thường (390×844) không đổi vì width-bound (maxVw nhỏ hơn boardAreaH nên
  height budget không phải constraint); viewport thấp/height-bound (375×520) tăng đúng 48px
  (263.4px→311.4px, +18%) — khớp chính xác con số 50−2=48 tính tay trước khi sửa.
- Không đụng nhánh `singleColumn`/non-zen (dòng 238+ gốc) — ngoài phạm vi B133.

## Chung cho cả 2 phần

- Verify bằng Playwright trên instance **cô lập**: copy repo sang `/tmp`, DB tạm tự tạo từ
  `schema.sql` (không đụng `server/db/gomoku.db` thật), cổng 3111, `CORS_ORIGIN=http://localhost:3111`
  riêng cho instance đó (nếu không set, socket.io handshake bị chặn — xem `[[project_cors_origin_required]]`
  trong bộ nhớ) — guest login → tạo phòng thật → đo `getBoundingClientRect()` canvas +
  `getImageData` pixel + screenshot.
- `client/js/` không có test tự động (theo `CLAUDE.md`) — không viết Jest, verify hoàn toàn qua
  Playwright như trên.
- Đụng `client/js/board.js` → bump `?v=123→124` toàn repo, verify bằng
  `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` ra đúng 1 giá trị.
