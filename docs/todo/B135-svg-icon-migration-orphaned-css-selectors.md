# #135 — SVG icon migration (#129) để sót nhiều CSS selector nhắm `i` (thẻ font-icon cũ), khiến icon co sai kích thước

**Trạng thái:** ✅ Đã sửa (một phần thật, một phần chưa xác nhận đúng nguyên nhân báo cáo gốc) —
**ĐÃ LÀM 2026-08-21** (`fix/svg-icon-migration-orphaned-selectors` off `dev`).

## Bối cảnh — vì sao mục này tồn tại

Người dùng báo icon "Lịch sử"/"Tạo phòng" trên `index.html` (sảnh chờ) hiện **to bất thường** ("zoom")
kèm ảnh chụp cho thấy icon lớn gấp nhiều lần chữ xung quanh. Khi dò code: `TODO.md #129` (2026-08-17,
migrate `<i class="ph ...">` → `<svg class="icon"><use ...></use></svg>`) chỉ audit **markup** ("0
phần tử `.ph-*` còn sót") chứ không audit **CSS selector nhắm thẳng thẻ `i`** — nhiều rule cũ
(`.link-action i`, `.tab-btn > i`, `.quick-chat-bar button i`, `.replay__back-btn i`/`
.replay__analysis-btn i`, `.tournament-card__status i`) không còn khớp phần tử nào (markup thật đã
đổi sang `<svg class="icon">`), nên icon ở các chỗ này **mất luôn rule `font-size` được thiết kế
riêng**, rơi về `.icon`'s `width:1em;height:1em` (main.css:115) và **kế thừa font-size từ phần tử
cha** thay vì giá trị đã chốt.

## Đã xác nhận bằng đo thật (Playwright, không phải suy đoán)

- File tĩnh cô lập (`file://.../client/index.html`, không đụng server/DB): trước khi sửa,
  `.link-action .icon` (icon "Lịch sử"/"Tạo phòng") đo được `15×15px` → **`13×13px`** (kế thừa
  `font-size: 13px` từ `.link-action` chính nó, thay vì rule riêng `font-size: 15px` đã bị orphan) —
  sau khi sửa, đúng lại `15×15px`. Xác nhận không rỗng bằng `git stash` chỉ phần CSS.
- Quét toàn bộ `client/css/*.css` tìm selector `i` không match markup thật: tìm được **9 rule/6 vị
  trí thật** đang bị ảnh hưởng (danh sách dưới), cộng 3 rule (`btn-create i`×2, `btn-secondary i`)
  xác nhận là **CSS chết từ trước, không liên quan #129** (không phần tử thật nào mang class đó có
  icon, kể cả trước #129) — **cố ý không đụng**, ngoài phạm vi mục này.
- Đây là **bug chỉ tồn tại trên `dev`**: `main` chưa merge #129 nên vẫn dùng `<i class="ph ...">`
  thật, các rule cũ trên `main` vẫn khớp đúng — không có bug này trên `main`.

## ⚠️ Chưa xác nhận khớp đúng độ lớn báo cáo gốc — đọc trước khi coi mục này là "đã xong" hoàn toàn

Đo trực tiếp trên **production thật** (`play3cr.dpdns.org`, đăng nhập khách qua UI thật, không chạm
DB) **ngay lúc vừa sửa xong, trước khi deploy bản sửa này**: icon đo được **đã đúng `15×15px`**,
**không hề to bất thường như ảnh chụp gốc của người dùng**. Tức là:

- Bug orphaned-selector có thật (đo được `13px` so với `15px` dự kiến trên bản dựng tĩnh cô lập) —
  **nhưng chênh lệch 2px không thể tạo ra hiện tượng "zoom" to như ảnh chụp gốc**.
- Nguyên nhân thật của ảnh chụp gốc **nhiều khả năng là cache trình duyệt/CDN không đồng bộ tại thời
  điểm chụp** (đúng lúc đang bump `?v=136→137→138` liên tục trong phiên làm việc trước đó — xem
  `[[feedback_verify_cache_before_deep_debug]]` trong bộ nhớ) — **không phải bug code lâu dài**, vì
  nếu là bug code thì phải tái hiện được ngay cả SAU KHI cache đã ổn định, mà thực tế đo lúc này lại
  không tái hiện được.
- **Chưa hỏi lại người dùng xác nhận** liệu hard-refresh (Ctrl+Shift+R) trên máy họ có còn thấy icon
  to hay không sau khi sự kiện bump `?v=` liên tục đã qua. Nếu vẫn to sau hard-refresh, quay lại điều
  tra — đừng coi bản sửa CSS này là đã giải quyết đúng report gốc chỉ vì nó sửa được một bug thật
  khác tìm thấy trong lúc điều tra.

## Danh sách 6 vị trí đã sửa (`i` → `.icon`)

1. `client/css/lobby-zen.css:211` — `.link-action i` → `.link-action .icon` (icon "Lịch sử"/"Tạo
   phòng"/"Tạo giải đấu" trong sảnh chờ — đúng chỗ người dùng báo).
2. `client/css/lobby-zen.css:387-388` — `.tournament-card__meta i, .tournament-card__status i` →
   `.icon` (icon trạng thái thẻ giải đấu trong tab "Giải đấu" — cùng trang, chưa được người dùng báo
   riêng nhưng cùng nguyên nhân).
3. `client/css/lobby-zen.css:538` — `.tournament-card__status i { display: none; }` (mobile) → `.icon`.
4. `client/css/room.css:425` — `.tab-btn > i { display: none; }` (skin mặc định, non-zen) → `.icon`.
5. `client/css/room-zen.css:577,990` — `.tab-btn > i` (icon rail zen-room, desktop + mobile) → `.icon`.
6. `client/css/room-zen.css:1049` — `.quick-chat-bar button i` (nút gửi chat nhanh mobile) → `.icon`.
7. `client/css/history.css:262-263,566-567` — `.replay__back-btn i, .replay__analysis-btn i`
   (desktop + mobile) → `.icon` (nút "Quay lại"/"Phân tích" trang lịch sử).

Ngoài phạm vi, cố ý không đụng: `client/css/lobby.css:101,112,141` (`.btn-create i`,
`.btn-create:hover i`, `.btn-secondary i`) — CSS chết từ trước #129, không phần tử thật nào mang các
class đó có icon con, sửa selector không đổi hành vi nào cả nên không đáng rủi ro đụng vào.

## Test

`client/css/` không có hạ tầng test tự động — xác minh bằng Playwright đo `getBoundingClientRect()`
trên file tĩnh cô lập (không server/DB) và trên production thật qua đăng nhập khách UI thật (chỉ đo,
không tạo phòng/ván). `npm test` **1197/1197** (không đổi số — thuần CSS, không có logic JS nào để
test thêm). `?v=138→139`, verify `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` ra
đúng 1 giá trị.
