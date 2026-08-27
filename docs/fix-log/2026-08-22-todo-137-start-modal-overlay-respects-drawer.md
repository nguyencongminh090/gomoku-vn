# Fix log entry — 2026-08-22 00:52

## Prompt

"Do #137" — mục `TODO.md` #137 đã tái hiện sẵn bằng Playwright hôm 2026-08-21, kèm
`docs/instruction/B137-*.md` chốt hướng làm và ranh giới "không đụng".

## Action

**Nhánh:** `fix/start-modal-overlay-respects-drawer` off `dev` (mục #137 chỉ có trên `dev`, không có
trên `main` — đã kiểm bằng `git show main:TODO.md | grep '#137'`).

### Nguyên nhân gốc

`#start-modal` neo vào `.board-area-shell` với `position:absolute; inset:0` (`client/css/game.css`).
Trong skin zen, `.room` là `display:block` nên shell **không** phải một cột grid — nó chiếm trọn
chiều rộng viewport, chỗ của drawer chỉ là `padding-right` của chính shell
(`room-zen.css` `body.zen-room .board-area-shell`). `inset: 0` phân giải theo **padding box**, nên
lớp phủ trải kín cả dải drawer. Hai hệ quả:

1. `z-index: 50` của `.start-modal` so trực tiếp với `z-index: 15` của `.panel-right-shell` trong
   root stacking context (shell có `position:relative` nhưng `z-index:auto` ⇒ không tạo stacking
   context). Chưa gây hại đo được vì lớp phủ là `pointer-events:none`, nhưng là mìn hẹn giờ.
2. `justify-content: center` căn thẻ theo tâm **viewport**, không phải tâm bàn cờ.

### Bản sửa

Chỉ `client/css/room-zen.css`, giữ nguyên anchor (đúng theo `docs/instruction/B137-*.md`: **không**
chuyển modal thành con của `#board-area` vì `GameUI.initBoard()` ghi đè `innerHTML` của phần tử đó):

```css
body.zen-room .start-modal {
  inset: 0 calc(var(--zen-drawer-w) + var(--zen-board-gutter)) 0 var(--zen-board-gutter);
  transition: inset 0.35s var(--ease);
}
body.zen-room.zen-drawer-collapsed .start-modal {
  inset: 0 calc(var(--zen-rail-w) + var(--zen-board-gutter)) 0 var(--zen-board-gutter);
}
```

Lớp phủ giờ trùng đúng **content box** của shell = hộp bàn cờ ⇒ thẻ tự căn tâm bàn cờ và không còn
chạm vào drawer. `z-index` **giữ nguyên 50** — thu vùng phủ là sửa tầng gốc, hạ `z-index` chỉ che
triệu chứng.

**Nhánh mobile ≤768px:** thêm đúng 1 dòng `inset: var(--zen-topnav-h) 0 auto 0;` vào
`body.zen-room.zen-drawer-collapsed .start-modal` trong khối `@media (max-width: 768px)`. Rule
desktop collapsed hơn rule mobile **1 class về độ đặc hiệu**, nên nếu thiếu dòng này thì `inset`
theo bề rộng rail của desktop sẽ rò xuống điện thoại. Đã kiểm chứng: bỏ dòng đó ra → test "mobile,
sheet collapsed" fail với `Expected: 393 / Received: 337` (đúng 393 − 56 = bề rộng rail).

### Đo bằng Playwright

Instance cô lập: copy repo, DB tạm từ `schema.sql`, cổng 3111, `CORS_ORIGIN` riêng,
`MAX_ROOMS_PER_IP=20` — không đụng DB/server thật.

| Tổ hợp | Chồng lấn ngang lớp phủ × drawer | Lệch tâm thẻ vs canvas |
|---|---|---|
| desktop 1440×900, drawer mở | **340px → 0** | **170px → 0** |
| desktop 1440×900, drawer collapsed | **56px → 0** | **28px → 0** |
| mobile 393×727, sheet mở | 393 → 393 (đúng thiết kế #139) | dx 0 → 0, dy −159 → −159 |
| mobile 393×727, sheet collapsed | 393 → 393 (đúng thiết kế #139) | dx 0 → 0, dy 39.4 → 39.4 |

Mobile **không đổi một pixel nào** — đúng như mong đợi, vì #139 cố ý neo lớp phủ vào dải trống giữa
topnav và bottom sheet; chồng lấn ngang ở đó là toàn phần theo thiết kế, cái phải giữ là chồng lấn
**dọc = 0** (dải nằm *trên* sheet), và test khẳng định đúng điều đó.

## Decision

Sửa **vùng phủ**, không sửa `z-index`: `z-index` là nơi triệu chứng nhìn thấy được, vùng phủ là nơi
giá trị sai được sinh ra (`CLAUDE.md` → "Root-cause diagnosis"). Giữ nguyên anchor
`.board-area-shell` theo đúng cảnh báo trong `docs/instruction/B137-*.md`. Không đụng
`.game-overlay` và không đụng cơ chế `pointer-events` của §B36.

## Summary output

`e2e/start-modal-board-centering.spec.ts` — 4 test (desktop/mobile × drawer mở/collapsed), giữ lại
làm hàng rào chống hồi quy vĩnh viễn:

- Với bản sửa: **4/4 pass**.
- Bỏ bản sửa ra (`git show HEAD:client/css/room-zen.css`): **2 test desktop fail**, 2 test mobile
  vẫn pass ⇒ test bắt đúng lỗi và mobile đúng là không bị ảnh hưởng.
- Bỏ riêng dòng `inset` của nhánh mobile: **"mobile, sheet collapsed" fail** (393 vs 337) ⇒ dòng đó
  chịu lực thật, không phải phòng hờ.

`e2e/start-modal-non-blocking.spec.ts` (§B36) vẫn **2/2 pass** trên cây đã sửa — cơ chế
`pointer-events` không bị đụng tới. `npm test` (Jest): **1213/1213**.

**Lưu ý về harness e2e:** chạy nhiều spec tạo phòng liên tiếp từ cùng một IP sẽ đụng `authLimiter`
(`server/routes/auth.js`: 20 request/15 phút/IP) và `MAX_ROOMS_PER_IP` (mặc định 3). Khi đó test fail
với "guest auth should succeed" hoặc `#room-id-nav` "element(s) not found" — đó là **giới hạn của môi
trường chạy**, không phải hồi quy. Khởi động lại server (limiter nằm trong bộ nhớ) trước khi kết
luận.

`?v=` 141 → 142 (đụng `client/css/`), kiểm bằng grep trong `CLAUDE.md`: đúng 1 giá trị duy nhất.

`client/js/` không có runner tự động cho CSS layout — hàng rào ở đây là e2e Playwright ở trên.
