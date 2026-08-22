# #142 — Track `1fr` của `.panel-right` phình theo tên người chơi, đẩy icon rail ra khỏi drawer

**Trạng thái:** ✅ Đã sửa (2026-08-22).

**Nguồn:** người dùng báo và **tự khoanh đúng nguyên nhân** (2026-08-22): *"panel-right ui-core is
fixed size, root cause is panel-player, predict: the status allocate more space then it move the
sidebar-tabs to the right side."* Kèm số đo DevTools Firefox trên site thật.

## Vấn đề

`client/css/room-zen.css`:

```css
body.zen-room .panel-right {
  width: calc(var(--zen-drawer-w) - 1px);   /* 339px — CỐ ĐỊNH */
  display: grid;
  grid-template-columns: 1fr var(--zen-rail-w);   /* ← lỗi */
  grid-template-rows: auto minmax(0, 1fr);        /* ← trục hàng ĐÃ đúng */
}
```

`1fr` là viết tắt của `minmax(auto, 1fr)`. Cái `auto` đó là **min-content của grid item** trong cột
— tức `.panel-players` — và track **từ chối co xuống dưới** giá trị đó.

`.slot-card__name` mang `white-space: nowrap`, nên min-content của nó là **toàn bộ bề rộng tên**.
`min-width: 0` trên `.slot-card` / `.slot-card__name` **không cứu được**: nó chỉ cho phép flex item
*co khi phân phối không gian*, không hạ min-content nội tại mà grid track dùng để tính kích thước.

⇒ Khi cả 2 ghế có người (tên thật, dài), cột nội dung phình vượt 339px và đẩy track rail (rộng cố
định 56px) ra ngoài mép phải, nơi `.panel-right-shell { overflow: hidden }` cắt mất.

Đây cũng là nguyên nhân của **cả hai** triệu chứng người dùng báo trong nhiều vòng trước:

1. *"sidebar moved to right side, space of right padding is lost"* — rail bị đẩy và cắt.
2. *"double line on collapse"* — khi collapse, viền trái của shell nằm ở mép trái vùng 56px, còn
   viền trái của **rail** bị đẩy lệch sang phải vài px ⇒ hai đường kẻ song song.

## Vì sao 4 vòng điều tra trước không tái hiện được

Playwright dùng **tài khoản khách với tên tự sinh ngắn** (`FastMink`, `KindSlug`…). Với tên ngắn,
min-content = 277px < track 283px ⇒ **không tràn**, mọi số đo đều bình thường. Lỗi chỉ lộ ra với tên
thật đủ dài. Bài học: fixture sinh dữ liệu "vừa đủ chạy" che mất chính lớp lỗi cần bắt.

## Số đo (Chromium 1920×995, server cô lập; Firefox cho kết quả y hệt)

| Trạng thái | Track thật | min-content `.panel-players` | rail tràn khỏi shell | rail còn thấy |
|---|---|---|---|---|
| Chưa ai ngồi | `283px 56px` | 165 | 0 | 56px |
| 2 người, tên ~13 ký tự | `326px 56px` | 326 | **43px** | **12.8px** |
| 2 người, tên 23 ký tự | `474px 56px` | 474 | **191px** | **0 — mất hẳn** |

Con số 12.8px khớp DevTools người dùng (`div.sidebar-tabs 21 × 935`), và cơ chế khớp chính xác
console họ gửi: `.panel-right` bắt đầu ở 676, track 1 = 303.63 ⇒ rail ở `676 + 303.63 = 979.63`,
đúng bằng số đo thật.

## Bản sửa

```css
grid-template-columns: minmax(0, 1fr) var(--zen-rail-w);
```

Ghim sàn của track về 0 ⇒ hình học drawer **độc lập với nội dung**: tên cắt ellipsis, rail không bao
giờ dịch. Đây đúng là thứ tác giả đã làm cho `grid-template-rows` ngay dòng dưới — trục cột là nửa
bị bỏ sót.

Sau khi sửa: min-content vẫn 474 nhưng track giữ nguyên `283px 56px`, rail nguyên vẹn ở mọi trạng
thái, `scrollWidth > clientWidth` trên `.slot-card__name` (ellipsis hoạt động đúng).

**Nhánh mobile ≤768px không dính lỗi** — đã có `grid-template-columns: 100%`.

## Test

`e2e/drawer-rail-not-displaced.spec.ts` — 2 test dùng **tài khoản thật tên 23 ký tự** (độ dài này là
điểm mấu chốt của fixture, đừng rút ngắn):

1. Rail nguyên vẹn qua 4 trạng thái: chưa ngồi → 1 người → 2 người + modal → collapsed; kèm khẳng
   định viền rail trùng viền shell khi collapsed (chống đường đôi).
2. Tên dài bị ellipsis chứ không nong drawer.

Bỏ bản sửa ra: **2/2 fail** với thông điệp `rail must not be pushed out of the shell` (Received: 58).
`npm test` 1227/1227. `e2e/start-modal-board-centering.spec.ts` (#137) vẫn 4/4 pass.

## Liên quan

- `docs/todo/B143-nut-dung-day-bop-ten-nguoi-choi.md` — hệ quả UX còn lại sau bản sửa này.
- `docs/todo/B137-*.md`, `docs/todo/B138-*.md` — cùng luồng điều tra drawer zen.
