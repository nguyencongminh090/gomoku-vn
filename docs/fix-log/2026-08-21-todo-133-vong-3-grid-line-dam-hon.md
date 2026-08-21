# Fix log entry — 2026-08-21 18:23

## Prompt

Sau vòng 2, người dùng: "Good. But, Line still add more weight, need darker grid." — alpha 0.4
(vòng 1) vẫn chưa đủ đậm trên máy thật.

## Action

`client/js/board.js`: grid line alpha (nhánh standard/caro) 0.4 → 0.55. Border cùng vị trí cũng
đang 0.4 (giá trị gốc, chưa từng đụng tới) — nếu chỉ tăng grid mà bỏ qua border, hai đường trùng
alpha, mất đúng thứ bậc "border đậm hơn grid" mà comment tại chỗ mô tả ("thicker and slightly
darker"). Tăng border theo lên 0.65, giữ khoảng cách tương đối.

## Decision

Không tăng alpha `stone` mode (giữ 0.55 — người dùng chỉ phàn nàn ở mode mặc định, ảnh chụp gốc là
mode standard/caro).

## Summary output

Playwright trên instance cô lập (copy repo mới + DB tạm + cổng 3111 + `CORS_ORIGIN` riêng): kích
thước canvas không đổi (390×844: 388px, đúng như vòng 2 — chỉ đổi màu, không đổi layout). Screenshot
xác nhận đường kẻ rõ hẳn so với vòng 1/2. `npm test` 1143/1143. `?v=125→126`, verify bằng
`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` ra đúng 1 giá trị.

[chi tiết TODO](../todo/B133-mobile-grid-line-nhat-va-ban-co-nho.md) ·
[vòng 2](2026-08-21-todo-133-vong-2-truc-ngang-tran-vien.md)
