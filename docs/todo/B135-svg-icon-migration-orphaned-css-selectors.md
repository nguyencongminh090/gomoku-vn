# #135 — SVG icon migration (#129) để sót nhiều CSS selector nhắm `i` (thẻ font-icon cũ), khiến icon co sai kích thước

**Trạng thái:** ✅ Đã sửa + đã xác nhận — **ĐÃ LÀM 2026-08-21** (`fix/svg-icon-migration-orphaned-selectors`
off `dev`). Người dùng xác nhận sau hard-refresh: hết hiện tượng "zoom" ("done").

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

## Độ lớn báo cáo gốc — ĐÃ XÁC NHẬN 2026-08-21: cache tạm thời, không phải bug code

Đo trực tiếp trên **production thật** (`play3cr.dpdns.org`, đăng nhập khách qua UI thật, không chạm
DB) **ngay lúc vừa sửa xong, trước khi deploy bản sửa này**: icon đo được **đã đúng `15×15px`**,
**không hề to bất thường như ảnh chụp gốc của người dùng**. Kết luận tại thời điểm đó:

- Bug orphaned-selector có thật (đo được `13px` so với `15px` dự kiến trên bản dựng tĩnh cô lập) —
  **nhưng chênh lệch 2px không thể tự nó tạo ra hiện tượng "zoom" to như ảnh chụp gốc**.
- Nghi ngờ chính: cache trình duyệt/CDN không đồng bộ tại thời điểm chụp (đúng lúc đang bump
  `?v=136→137→138` liên tục trong phiên làm việc trước đó — xem
  `[[feedback_verify_cache_before_deep_debug]]` trong bộ nhớ), không phải bug code lâu dài.

**Người dùng xác nhận sau khi hard-refresh (Ctrl+Shift+R): icon không còn to bất thường ("done").**
Giả thuyết cache tạm thời đúng — không có bug code nào khác đang ẩn giấu đằng sau report gốc. Bản
sửa 6 selector mồ côi ở trên vẫn giữ nguyên giá trị (bug thật, dù nhỏ, đúng theo audit gap của #129),
chỉ là **không phải nguyên nhân của ảnh chụp gốc** — hai việc độc lập, cả hai đều đã đóng.

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
