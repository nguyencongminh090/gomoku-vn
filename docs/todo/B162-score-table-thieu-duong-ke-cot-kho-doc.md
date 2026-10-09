# B162 — Bảng điểm (Score Board) thiếu đường kẻ cột, khó đọc

**Nguồn:** báo cáo người dùng — Scope: Room / Score Board / UI (2026-08-28)

**Mô tả:** `.score-table` trong tab "Bảng điểm" (`room.html` #tab-score) hiện chỉ
có chữ căn giữa, padding 2–4px, **không có đường kẻ cột nào** → các cột
Tên / Thắng / Thua / Hoà dính vào nhau, khó dò theo hàng/cột.

**Kỳ vọng:** thêm lưới/đường kẻ **theo cột** (grid) cho dễ đọc — **không** thêm
viền ngoài (no border quanh bảng).

**Giải pháp đề xuất:** trong `client/css/room.css` (block `.score-table` ~dòng
369–387) thêm `border-right: 1px solid var(--c-border-light)` cho `th`/`td` trừ
`:last-child` (chỉ kẻ dọc giữa các cột, không kẻ khung ngoài). Cân nhắc thêm
`border-bottom` mảnh dưới hàng `th` để tách header. Đối chiếu bản zen
(`room-zen.css:559+`) — nếu bản zen cũng thiếu thì áp cùng cách với token màu của
zen. Kiểm cả breakpoint mobile (`room.css:913`).

**Đánh giá hiệu quả/an toàn:** thuần CSS, phạm vi 1 component, không đụng JS/DOM
(`renderScoreTable` giữ nguyên). Rủi ro thấp.

**Bump `?v=N`:** có — chạm `client/css/room.css` (và có thể `room-zen.css`) →
bump toàn `client/` theo rule CLAUDE.md.

**Unit test:** client-side chưa có hạ tầng test tự động → verify bằng browser
thật (tab Bảng điểm, bản thường + zen + mobile).

**Trạng thái:** ✅ Đã sửa (2026-08-28, `fix/score-table-column-grid` → `dev`).
- `client/css/room.css` `.score-table`: thêm `border-bottom` dưới `th` (tách
  header) + `border-right` cho `th/td:not(:last-child)` (kẻ dọc giữa cột, không
  viền ngoài); padding ô 2×4px → 3×8px cho chữ thoáng khỏi đường kẻ.
- `client/css/room-zen.css`: thêm cùng bộ `border-right` + `padding-right/left`
  12px giữa các cột cho đồng bộ (bản zen vốn đã có kẻ ngang theo hàng).
- Bump `?v=162` → `?v=163` toàn `client/`; grep xác nhận 1 giá trị.
- Verify: harness tĩnh nạp `room.css` thật + markup `.score-table`, screenshot
  Chromium 420px — cột tách rõ, header có gạch chân, không có khung ngoài do
  bảng tạo. Client chưa có test tự động (đã nêu trong CLAUDE.md).

`[Model: Sonnet 5]`
