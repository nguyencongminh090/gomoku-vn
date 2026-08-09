# Phần B #73. Nút `.btn.btn-confirm` (và `.btn` trơn) hoàn toàn không có base style khi dùng ngoài modal

**Nguồn:** báo cáo người dùng kèm 4 ảnh chụp màn hình — trang giải đấu (danh sách, chi tiết, banner
"Xem cặp đấu"/"Báo giờ"/"Sẵn sàng"), và modal kết quả trận (nút "Sẵn sàng" sau khi thắng) — tất cả
hiện ra như nút mặc định của trình duyệt (không bo góc, không màu, không padding chuẩn), "no css?"
(2026-08-08). Xác nhận bằng cách đọc toàn bộ `client/css/*.css` + trace các trang HTML liên quan.

## Vấn đề đã xác nhận

`.btn` và `.btn-confirm` **không có rule base (unscoped) nào áp dụng được trên các trang giải đấu**:

- `.btn { ... }` base thật duy nhất nằm ở [login.css:339](../../client/css/login.css#L339) — nhưng
  `login.css` **không được load** trên `tournament.html`, `tournament-match.html`, hay `index.html`
  (chỉ `main.css`/`lobby.css`/`tournament.css`/... — xem `<link>` trong từng file). Ngay cả nếu có
  load, `.btn` ở đó được thiết kế riêng cho "magnetic button" 2 lớp con (`.btn-icon-wrapper` +
  `.btn-text`) của trang login — không khớp cấu trúc `<button class="btn btn-confirm">Text</button>`
  phẳng dùng ở nơi khác.
- `.btn-confirm` **chưa từng có rule unscoped** ở bất kỳ đâu. Rule duy nhất tồn tại là
  [lobby.css:629](../../client/css/lobby.css#L629) `.modal__actions .btn-confirm { ... }` — chỉ áp
  dụng khi nút nằm bên trong `.modal__actions`.
- Các rule khác tham chiếu `.btn`/`.btn-confirm` trên trang giải đấu chỉ set **kích thước bổ sung**
  (padding/font-size), không có display/background/border-radius/color:
  [tournament.css:116](../../client/css/tournament.css#L116)
  `.pairing-card__actions .btn, .pairing-card__actions .btn-secondary { padding: 8px 14px; ... }`,
  [tournament.css:217](../../client/css/tournament.css#L217)
  `.swap2-banner__actions .btn-secondary, .swap2-banner__actions .btn { padding: 6px 12px; ... }`,
  [lobby.css:1002](../../client/css/lobby.css#L1002)
  `.tournament-card__actions .btn, .tournament-card__actions .btn-secondary { flex: 1; }`.
- Kết quả: mọi `<button class="btn btn-confirm">`/`<a class="btn btn-confirm">` **ngoài
  `.modal__actions`** render với UA stylesheet mặc định của trình duyệt (chỉ có `flex`/`padding` bổ
  sung nếu nằm trong 1 trong 3 container trên, không có gì nếu không).
- **`.btn-secondary` không bị lỗi này** — nó có base unscoped thật ở
  [lobby.css:117](../../client/css/lobby.css#L117) (display/padding/border/border-radius:9999px/
  background/box-shadow), nên các nút như "Huỷ giải đấu"/"Xin đổi lịch" trông đúng.

**Danh sách vị trí bị ảnh hưởng** (tất cả dùng `class="btn btn-confirm"` hoặc tương đương, ngoài
`.modal__actions`):

- `client/js/tournaments.js:304,309` — nút "Bắt đầu"/"Đăng ký" trên card danh sách giải đấu
  (`index.html`, khớp ảnh 1).
- `client/js/tournament-detail.js:314` — nút banner "Xem cặp đấu" (khớp ảnh 2).
- `client/js/tournament-detail.js:383,389,396,407,416,422` — nút "Báo giờ"/"Chốt giờ này"/
  "Xác nhận"/"Duyệt đổi lịch"/"Sẵn sàng"/"Vào trận" trong pairing card (khớp ảnh 3).
- `client/tournament-match.html:162,179` — nút "Quay lại giải đấu" (link kết quả) và
  "Sẵn sàng" (series-transition, hiện ra trong modal thắng/thua — khớp ảnh 4).
- `client/js/tournament-match.js:415` — nút chọn vị trí Swap2.
- `client/tournament.html:89,106,127,147` — nút submit trong các modal Báo giờ/Tranh chấp/Đổi lịch/
  Chốt giờ **thật ra nằm trong `.modal__actions` nên KHÔNG bị lỗi này** — chỉ liệt kê để đối chiếu
  loại trừ.

Đây là bug phát sinh **ngoài phạm vi TODO.md #70** (đã đóng "đã xong") — #70 audit lệch màu/token,
không kiểm tra "class này có base style nào áp dụng được không ngoài modal", nên bug cấu trúc này lọt
qua. Xác nhận bằng cách đọc `docs/todo/B70-*.md`: verify của #70 chỉ chụp `login.html`/`index.html`
(modal tạo phòng)/`room.html` — không chụp trang giải đấu.

## Việc cần làm

- Thêm 1 rule base **unscoped** cho `.btn`/`.btn-confirm` (dùng chung style pill hiện có ở
  `.modal__actions .btn-confirm` làm chuẩn: `background: var(--c-brand); color: #fff; border-radius:
  9999px; ...`) vào 1 file CSS được load trên mọi trang cần (`tournament.css` hoặc `lobby.css`) —
  không định nghĩa lại trong nhiều file gây trôi giống hệt bug #70 vừa sửa.
- Giữ nguyên các rule scoped hiện có (`.pairing-card__actions .btn`, `.tournament-card__actions
  .btn`, `.swap2-banner__actions .btn`, `.modal__actions .btn`) làm override kích thước — chỉ thêm
  base, không xoá override.
- Kiểm tra `client/tournament-match.html:162` (`<a class="btn btn-confirm">`) hoạt động đúng khi base
  áp dụng cho cả `<a>` lẫn `<button>` (giống cách `.modal__actions .btn` đã làm).
- Bump `?v=N` theo `CLAUDE.md` vì đổi file CSS.
- Verify bằng browser thật (không chỉ đọc code) cả 4 vị trí trong ảnh báo cáo: danh sách giải đấu,
  banner chi tiết giải đấu, pairing card, modal kết quả trận — cả light/dark mode.

## Đánh giá hiệu quả / an toàn

- **Hiệu quả:** cao — sửa đúng root cause (base rule bị thiếu), không phải patch từng nút riêng lẻ.
- **An toàn:** thấp rủi ro — CSS-only, thêm rule mới không xoá gì, không đổi HTML/JS structure hay
  class name đang được JS reference.

## Trạng thái

✅ ĐÃ XONG (2026-08-08, branch `fix/btn-confirm-base-style-outside-modal` trên `dev` — nhánh off
`dev` vì entry #73 chỉ tồn tại trên `dev`, không có trên `main`).

**Đã làm:**
- Thêm rule base unscoped `.btn` (layout: inline-flex/padding/border-radius:9999px/pointer) +
  `.btn-confirm` (nền `var(--c-brand)`, hover/active khớp `.modal__actions .btn-confirm`) vào
  `client/css/lobby.css`, ngay sau `.btn-secondary` — vì `lobby.css` được load trên mọi trang cần
  (`index.html`, `tournament.html`, `tournament-match.html`).
- Giữ nguyên toàn bộ rule scoped hiện có (`.pairing-card__actions .btn`,
  `.tournament-card__actions .btn`, `.swap2-banner__actions .btn`, `.modal__actions .btn`) — chúng
  vẫn override kích thước đúng như cũ, chỉ base bị thiếu trước đó là được bù thêm.
- Bump `?v=83` → `?v=84` toàn bộ `client/*.html` + `client/js/*.js` theo đúng quy tắc cache-busting,
  verify bằng `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` → đúng 1 giá trị `?v=84`.

**Verify:** chạy server thật với DB tạm (theo quy tắc Playwright/e2e trong `CLAUDE.md` — dời
`gomoku.db` ra, chạy DB rỗng, phục hồi DB thật sau khi xong), dựng trang probe qua static file
server load đúng `main.css`/`lobby.css`/`tournament.css` (`?v=84`) tái tạo markup thật của cả 5 vị
trí bị ảnh hưởng (`tournaments.js:304`, `tournament-detail.js:314`, `tournament-detail.js:383`,
`tournament-match.html:162,179`). `getComputedStyle` xác nhận cả 5 đều ra `background: rgb(79, 70,
229)`, `color: rgb(255,255,255)`, `border-radius: 9999px` — khớp hình pill của `.btn-secondary` đã
đúng từ trước — ở cả `light` và `dark` `prefers-color-scheme`. Screenshot xác nhận trực quan. Không
có console/page error. Không chạy `npm test` vì CSS-only, `client/` không có test runner tự động
(giống tiền lệ #70). Chi tiết đầy đủ trong `docs/fix-log/2026-08-08-todo-73-btn-confirm-missing-base-style.md`.
