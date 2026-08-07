# Fix log entry — 2026-08-07 23:48

## Prompt

TODO.md #61 / instruction.md B61 (review nhanh UI desktop theo yêu cầu người dùng, 2026-08-07):
trên `client/tournament-match.html` (desktop), khối `.match-clocks` (2 ô đồng hồ người chơi) nằm
quá sát dòng `#match-meta` phía trên, đặc biệt với text meta dài ("Đấu tới 3 điểm, cách biệt 2").

## Action

- `client/css/tournament.css`: thêm `padding-bottom: 12px` vào `.match-page-header` (dòng ~158-166)
  — khối chứa `#match-meta`. Đây là thay đổi phía `tournament.css` (match-specific), không đụng
  `.room` trong `room.css` (dùng chung với `room.html`), đúng ranh giới nêu trong instruction.md
  B61.
- Bump cache-bust `?v=75` → `?v=76` trên toàn bộ `client/*.html` và mọi `import '...?v=N'` trong
  `client/js/*.js` (trừ 2 file `*-mockup.html`), theo quy tắc "Cache-busting version bump" trong
  CLAUDE.md. Xác nhận `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` chỉ còn đúng
  một giá trị `?v=76`.

## Decision

- Thuần CSS, không đụng JS/logic — theo "Bug-fix workflow" trong CLAUDE.md, `client/js/` hiện
  không có test infra tự động nên không viết unit test; verify bằng Playwright điều khiển trực tiếp
  `client/tournament-match.html` qua `file://` (không cần server/DB — tránh rủi ro chạm DB thật).
- Verify bằng cách đo `getBoundingClientRect()` gap giữa đáy `#match-meta` và đỉnh `.match-clocks`
  ở 1280×800 / 1440×900 / 1920×1080, với text meta dài (tên giải đấu dài + "Ván 2" + "Đấu tới 3
  điểm, cách biệt 2") và canvas được set kích thước mô phỏng board.js thực tế (không cố định
  640px — dùng kích thước tự co theo không gian còn lại trong `.board-area-shell`, khớp cách
  `BoardRenderer.resize()` hoạt động thật). Ở kích thước cố định canvas 640px trên viewport thấp
  (720px) tái hiện đúng lỗi gốc: `.match-clocks` chồng lên đè hẳn lên text meta — xác nhận đây thật
  sự là vùng gây lỗi, nhưng không phải kịch bản thực tế (board.js luôn co canvas theo không gian còn
  lại, không giữ cố định 640px trên viewport thấp) nên không dùng làm ngưỡng verify chính.
- So sánh trước/sau (qua `git stash`) ở kích thước canvas thực tế: gap tăng đúng +12px ở mọi độ
  rộng (1280: 28.1→40.2px; 1440: 28.1→40.1px; 1920: 34.6→46.6px) — khớp với `padding-bottom: 12px`
  vừa thêm, không có tác dụng phụ khác.

## Summary output

Thêm `padding-bottom: 12px` cho `.match-page-header` trong `client/css/tournament.css`, tăng
khoảng cách dọc giữa `#match-meta` và `.match-clocks` thêm 12px ở mọi độ rộng desktop đã test
(1280/1440/1920px). Bump `?v=76` đồng bộ toàn bộ `client/*.html` + `client/js/*.js` import.
