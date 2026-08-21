# Fix log entry — 2026-08-21 21:37

## Prompt

Người dùng gửi ảnh chụp `index.html` (sảnh chờ, production) cho thấy icon "Lịch sử"/"Tạo phòng" to
bất thường ("zoom") so với chữ xung quanh, hỏi tại sao và ghi nhận "It seems lobby has some modified
(index.html)".

## Action

Điều tra tìm ra `TODO.md #129` (2026-08-17, migrate `<i class="ph...">` → `<svg class="icon"><use
...></use></svg>`) chỉ audit markup ("0 phần tử `.ph-*` còn sót") mà không audit CSS selector nhắm
thẳng thẻ `i` — quét toàn `client/css/*.css` tìm được 9 rule/6 vị trí thật (`lobby-zen.css`'s
`.link-action`+`.tournament-card__status`/`__meta`, `room.css`+`room-zen.css`'s `.tab-btn`+
`.quick-chat-bar button`, `history.css`'s `.replay__back-btn`/`.replay__analysis-btn`) không còn
khớp markup thật, khiến icon rơi về kế thừa font-size từ phần tử cha thay vì rule riêng đã chốt. Sửa
cả 6 vị trí (`i` → `.icon`, không đổi giá trị nào khác). Đo bằng Playwright trên bản dựng tĩnh cô lập
(`file://`, không đụng server/DB) xác nhận `.link-action .icon` đổi từ 13px (kế thừa sai) → 15px
(đúng rule); kiểm chứng không rỗng bằng `git stash` phần CSS.

**Phát hiện quan trọng khi đo trên production thật** (đăng nhập khách qua UI thật —
`playwright-e2e-safety` skill, chỉ đo không tạo phòng/ván, không đụng DB) **trước khi deploy bản sửa
này**: icon đã đo được đúng **15×15px** — không hề to như ảnh chụp gốc của người dùng. Chênh lệch
13px→15px (2px) không thể tạo ra hiện tượng "zoom" rõ rệt trong ảnh gốc. Nghi ngờ chính: ảnh chụp gốc
trùng đúng lúc phiên trước đang bump `?v=136→137→138` liên tục (deploy PR #18, PR #19) — khả năng
cao là cache trình duyệt/CDN không đồng bộ tại thời điểm chụp, không phải bug code dài hạn.

## Decision

Vẫn giữ bản sửa này (bug thật, tuy nhỏ, đúng theo #129's audit gap) thay vì bỏ qua — nhưng **không**
báo cáo đây là đã giải quyết xong report gốc "icon zoom", vì bằng chứng đo được không khớp độ lớn.
Ghi rõ trong `docs/todo/B135-*.md` mục cảnh báo + yêu cầu người dùng xác nhận lại sau hard-refresh
trước khi coi mục này đã đóng hoàn toàn đối với report gốc.

Không đụng `lobby.css`'s `.btn-create i`/`.btn-secondary i` — xác nhận là CSS chết từ trước #129
(không phần tử thật nào dùng 2 class đó kèm icon), ngoài phạm vi.

## Summary output

`client/css/` không có hạ tầng test tự động — verify bằng Playwright đo `getBoundingClientRect()`
(bản dựng tĩnh cô lập + production thật qua guest login UI thật). `npm test` **1197/1197** (không
đổi — thuần CSS, không thêm logic JS nào để test). `?v=` 138→139, verify `grep -rn "?v=" client/*.html
client/js/*.js | grep -v mockup` ra đúng 1 giá trị.

`fix/svg-icon-migration-orphaned-selectors` off `dev` (bug chỉ tồn tại trên `dev` — `main` chưa merge
#129 nên vẫn dùng `<i class="ph...">` thật, không dính bug này). Merge lại `dev`, không đụng `main`.
