# #143 — Nút "đứng dậy" (`✕`) bóp tên người chơi xuống còn ~3 ký tự ở ghế của chính mình

**Trạng thái:** ✅ ĐÃ XONG.

**Nguồn:** quan sát khi kiểm chứng bản sửa #142 (2026-08-22). Không phải lỗi do #142 gây ra — #142
chỉ làm nó **hiện ra đúng bản chất** thay vì để layout vỡ.

## Vấn đề

Sau #142, tên dài được cắt bằng ellipsis đúng thiết kế. Nhưng ở **ghế của chính mình**,
`.slot-card__header` còn chứa nút `✕` (`.slot-card__stand`) với `min-width: 32px; min-height: 32px`
cộng `gap: 6px`. Trong thẻ ghế rộng ~117px (viewport 1920px, drawer 340px), tên chỉ còn ~70px:

| Ghế | Hiển thị |
|---|---|
| #1 (của mình, có nút `✕`) | `Ngu…` |
| #2 (đối thủ, không có nút) | `Trần Hoàn…` |

Bất đối xứng và ghế của chính mình lại đọc được ít nhất — ngược với kỳ vọng.

## Vòng 1 (đã thay bằng vòng 2 bên dưới)

Đưa `✕` ra khỏi dòng tên: `.slot-card` thêm `position: relative`, `.slot-card__stand` đổi
sang `position: absolute; top: 0; right: 0` (bỏ khỏi flex row của `.slot-card__header`), trôi vào
góc trên thẻ. `.slot-card__header` thêm `padding-top: 18px` áp đều cho cả hai ghế. Đo Playwright:
trước sửa `clientWidth` 40px (có nút) vs 78px (không nút), sau sửa cả hai 78px — full parity.
`npm test` **1230/1230**, `?v=144→145`.

Người dùng xem trực tiếp, phản hồi: kiểu inline cũ **đẹp và thu hút mắt hơn**; kiểu góc-thẻ mới
làm slot **trông rời rạc**. Hỏi lại qua `AskUserQuestion`: chọn quay về inline nhưng **thu nhỏ**
nút thay vì revert nguyên trạng (giữ nguyên bug bóp tên) hay full-parity-nhưng-rời-rạc.

## Vòng 2 — hướng chốt cuối cùng

Quay `.slot-card__stand` về **inline** trong `.slot-card__header` (`justify-content: space-between`,
`gap: 6px`, `flex-shrink: 0` — y hệt cấu trúc gốc trước #143), bỏ `position: absolute` và
`padding-top` của vòng 1. Điểm khác so với bản gốc: `min-width`/`min-height` hạ từ `32px` xuống
**`24px`** — đúng sàn **WCAG 2.2 AA "target size (minimum)"**, không phải số tuỳ ý, và
`padding` giảm `6px 8px` → `3px 5px` tương ứng. Không hạ dưới 24px.

Đo (2 tài khoản thật tên 23 ký tự, viewport 1920×995): `clientWidth` tên ghế có nút **40px → 48px**
(cải thiện 8px đúng bằng phần nút giảm, không đạt full parity với ghế không nút (78px) — đúng
tradeoff người dùng chấp nhận khi chọn giữ inline). Nút đo được đúng `24×24px`, không chồng lấp
với `.slot-card__name`.

**Kiểm chứng chạm thật** (bắt buộc theo ràng buộc gốc của mục này — hạ ngưỡng chạm phải kiểm chứng
lại bằng chạm thật trên viewport điện thoại): Playwright `devices['Pixel 5']` (`hasTouch`,
`isMobile`), `page.tap()` thật vào nút 24px — đứng dậy thành công (`#slot-1` chuyển sang
`.slot-card__empty`), không phải chỉ đo kích thước trên desktop.

Test mới `e2e/slot-card-stand-inline-touch-target.spec.ts` (đổi tên/nội dung từ
`slot-card-stand-name-symmetry.spec.ts` của vòng 1 — mục tiêu đổi từ "full parity" sang "inline +
sàn 24px", giữ assertion cũ sẽ luôn fail sai với quyết định mới nên viết lại thay vì giữ nguyên):
kịch bản 1 đo kích thước 24px + không chồng lấp (bỏ bản sửa ra → fail đúng `received 32`); kịch bản
2 chạm thật trên Pixel 5. `e2e/drawer-rail-not-displaced.spec.ts` (#142) vẫn 2/2 pass. `npm test`
**1230/1230**, `?v=145→146`.

## Liên quan

- `docs/todo/B142-grid-track-1fr-day-rail-ra-khoi-drawer.md` — bản sửa làm lộ ra mục này.
