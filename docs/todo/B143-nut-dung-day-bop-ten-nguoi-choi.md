# #143 — Nút "đứng dậy" (`✕`) bóp tên người chơi xuống còn ~3 ký tự ở ghế của chính mình

**Trạng thái:** ⏳ Chưa làm.

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

## Hướng (chưa chốt)

Vài lựa chọn, cần bàn trước khi làm:

- Đưa `✕` ra khỏi dòng tên (góc trên thẻ, `position: absolute`) để tên dùng trọn bề rộng.
- Giảm `min-width`/`min-height` 32px của `✕` — **cẩn thận**: 32px là ngưỡng chạm tối thiểu trên
  mobile, đừng hạ mà không kiểm tra lại trên điện thoại.
- Cho tên xuống dòng thứ 2 thay vì ellipsis khi thẻ quá hẹp.

## Liên quan

- `docs/todo/B142-grid-track-1fr-day-rail-ra-khoi-drawer.md` — bản sửa làm lộ ra mục này.
