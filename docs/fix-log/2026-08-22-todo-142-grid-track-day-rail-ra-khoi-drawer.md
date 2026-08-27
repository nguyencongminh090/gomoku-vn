# Fix log entry — 2026-08-22 10:12

## Prompt

Người dùng gửi ảnh + số đo DevTools Firefox từ site thật, tự khoanh nguyên nhân: *"panel-right
ui-core is fixed size, root cause is panel-player, predict: the status allocate more space then it
move the sidebar-tabs to the right side."* Sau khi tôi trình bày 2 phương án: *"Okay, I choose A"*.

## Action

### Nguyên nhân gốc

`.panel-right` là grid **rộng cố định** `calc(var(--zen-drawer-w) - 1px)` = 339px, với
`grid-template-columns: 1fr var(--zen-rail-w)`.

`1fr` là viết tắt của `minmax(auto, 1fr)`. Cái `auto` đó là **min-content của grid item** trong cột
(`.panel-players`), và track **từ chối co xuống dưới** giá trị đó. `.slot-card__name` mang
`white-space: nowrap` ⇒ min-content của nó là **trọn bề rộng tên**. `min-width: 0` — vốn đã có sẵn
trên `.slot-card` và `.slot-card__name` — **không cứu được**: nó chỉ hạ ngưỡng co của flex item khi
phân phối không gian, không hạ min-content nội tại mà grid dùng để size track.

⇒ Khi cả 2 ghế có người với tên thật đủ dài, cột nội dung phình vượt 339px và **đẩy track rail 56px
ra ngoài mép phải**, nơi `.panel-right-shell { overflow: hidden }` cắt mất.

Một nguyên nhân, **hai** triệu chứng mà người dùng đã báo qua nhiều vòng:

1. "sidebar moved to right side, space of right padding is lost" — rail bị đẩy rồi cắt.
2. "double line on collapse" — khi collapse, viền trái shell nằm ở mép vùng 56px còn viền trái
   **rail** bị đẩy lệch vài px ⇒ hai đường kẻ song song.

### Vì sao 4 vòng điều tra trước trượt

Mọi script Playwright trước đó dùng **tài khoản khách**, tên tự sinh ngắn (`FastMink`, `KindSlug`).
Với tên đó min-content = 277px, **dưới** track 283px ⇒ không tràn, mọi số đo bình thường và tôi kết
luận "không tái hiện được". Tôi đã đi soi tầng *viền* (border stacking, dpr, engine, DevTools
overlay) trong khi giá trị sai được sinh ra ở tầng *grid track* — đúng cái bẫy mà `CLAUDE.md` →
"Root-cause diagnosis" mô tả. Chính người dùng mới là người truy ra tầng đúng.

### Số đo (Chromium 1920×995, server cô lập; Firefox y hệt)

| Trạng thái | Track thật | min-content | rail tràn khỏi shell | rail còn thấy |
|---|---|---|---|---|
| Chưa ai ngồi | `283px 56px` | 165 | 0 | 56px |
| 2 người, tên ~13 ký tự | `326px 56px` | 326 | **43px** | **12.8px** |
| 2 người, tên 23 ký tự | `474px 56px` | 474 | **191px** | **0 — mất hẳn** |

12.8px khớp DevTools người dùng (`div.sidebar-tabs 21 × 935`); và cơ chế khớp chính xác console họ
gửi: `.panel-right` bắt đầu ở 676, track 1 = 303.63 ⇒ rail ở 979.63 — đúng số họ đo.

### Bản sửa

```css
grid-template-columns: minmax(0, 1fr) var(--zen-rail-w);
```

Một dòng. Ghim sàn track về 0 ⇒ hình học drawer độc lập với nội dung. Sau khi sửa: min-content vẫn
474 nhưng track giữ `283px 56px`, rail nguyên vẹn ở mọi trạng thái, tên cắt ellipsis
(`scrollWidth > clientWidth`, `text-overflow: ellipsis`).

Nhánh mobile ≤768px không dính lỗi (đã có `grid-template-columns: 100%`) nên không đụng tới.

## Decision

Chọn phương án A (`minmax(0, 1fr)`) thay vì B (chặn min-content tại nguồn, ví dụ thêm `min-width: 0`
cho `.slot-card__header`): B giảm được min-content **hiện tại** nhưng không **bảo đảm** — bất kỳ nội
dung mới nào sau này (badge dài hơn, thêm nút) sẽ tái hiện lỗi. A làm hình học drawer độc lập với
nội dung, đúng điều thiết kế vốn giả định, và chỉ là lặp lại thứ tác giả đã làm cho
`grid-template-rows` ngay dòng dưới — trục cột là nửa bị bỏ sót.

Không đụng `overflow:hidden` / `justify-content:flex-end` / width cố định: cơ chế cắt xén là chủ ý
(§B138). Hệ quả UX còn lại (nút `✕` bóp tên ở ghế của chính mình) **ghi thành #143**, không gộp vào
bản sửa này.

## Summary output

`e2e/drawer-rail-not-displaced.spec.ts` — 2 test, dùng **tài khoản thật đăng ký qua UI với tên 23 ký
tự**; độ dài đó là điểm mấu chốt của fixture và có ghi chú trong file là đừng rút ngắn (đúng thứ đã
giấu lỗi suốt 4 vòng):

1. Rail nguyên vẹn qua 4 trạng thái (chưa ngồi → 1 người → 2 người + modal → collapsed), kèm khẳng
   định viền rail **trùng** viền shell khi collapsed — chống đúng triệu chứng "đường đôi".
2. Tên dài bị ellipsis chứ không nong drawer.

Bỏ bản sửa ra: **2/2 fail**, thông điệp `rail must not be pushed out of the shell`, `Received: 58`.
`npm test` **1227/1227**. `e2e/start-modal-board-centering.spec.ts` (#137) vẫn **4/4 pass**.
`e2e/start-modal-non-blocking.spec.ts` fail 1/2 — đúng flakiness đã ghi ở **#141** (đua `?id=`), fail
cả trên `HEAD`, không phải hồi quy.

`?v=` 143 → 144. Nhánh `fix/drawer-rail-pushed-by-grid-track` off **`dev`**: dòng lỗi có trên cả
`main`, nhưng site thật đang phục vụ `dev` (DevTools người dùng báo `room-zen.css:583` = dev; `main`
là 551) và toàn bộ luồng #135–#141 cũng chỉ có trên `dev` — bản vá sẽ tới `main` ở checkpoint
`dev`→`main` kế tiếp cùng cả nhóm.
