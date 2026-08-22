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

## Hướng đã chọn (người dùng chọn qua AskUserQuestion)

Đưa `✕` ra khỏi dòng tên: `.slot-card` thêm `position: relative`, `.slot-card__stand` đổi
sang `position: absolute; top: 0; right: 0` (bỏ khỏi flex row của `.slot-card__header`), trôi vào
góc trên thẻ — nơi dòng nhãn `#1`/`#2` gần như trống chỗ. `.slot-card__header` được thêm
`padding-top: 18px` (áp **đều cho cả hai ghế**, có nút hay không) để dòng tên luôn nằm dưới đáy nút
✕ mà không lệch chiều cao giữa hai ghế. `min-width/min-height: 32px` của `✕` **giữ nguyên** — không
đụng ngưỡng chạm mobile.

Đo bằng script Playwright thủ công (2 tài khoản thật tên 23 ký tự, viewport 1920 và 1280): trước
sửa `clientWidth` dòng tên ghế có nút = 40px vs ghế không nút = 78px (khớp mô tả bug `Ngu…` vs
`Trần Hoàn…`); sau sửa cả hai = 78px, không chồng lấp giữa `.slot-card__name` và `.slot-card__stand`
ở cả hai viewport. Test e2e mới `e2e/slot-card-stand-name-symmetry.spec.ts` (2 kịch bản, 1920 +
1280px) — xác nhận fail đúng như mô tả khi bỏ bản sửa ra (stash `room.css`), pass lại sau khi áp
lại. `e2e/drawer-rail-not-displaced.spec.ts` (#142) vẫn 2/2 pass — không tái phát #142. `npm test`
**1230/1230**, `?v=144→145`.

## Liên quan

- `docs/todo/B142-grid-track-1fr-day-rail-ra-khoi-drawer.md` — bản sửa làm lộ ra mục này.
