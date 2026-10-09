# Fix log entry — 2026-08-28 02:35

## Prompt

Báo cáo người dùng (Scope: Room / Score Board / UI): "Score Board Display result
with no column based and make the table hard to read. Expect: Add column
base/grid (no border)." → stack thành TODO.md #162, rồi "Do #162".

## Action

- `client/css/room.css` block `.score-table` (~374–390):
  - `th`: thêm `border-bottom: 1px solid var(--c-border-light)` để tách hàng
    tiêu đề.
  - Rule mới: `.score-table th:not(:last-child), .score-table td:not(:last-child)
    { border-right: 1px solid var(--c-border-light); }` — chỉ kẻ dọc **giữa** các
    cột. `border-collapse: collapse` đang bật nên nếu kẻ cả ô cuối sẽ thành viền
    ngoài; `:not(:last-child)` tránh đúng điều người dùng không muốn ("no
    border").
  - `padding` ô: `2px 4px` → `3px 8px` để chữ/số không dính vào đường kẻ.
- `client/css/room-zen.css` (sau `tr:last-child td`): cùng bộ `border-right` +
  `padding-right/left: 12px` giữa các cột, cho bản zen đồng bộ (zen vốn đã có kẻ
  ngang theo hàng, chỉ thiếu kẻ dọc).
- Bump `?v=162` → `?v=163` toàn `client/*.html` + `client/js/*.js` (trừ mockup);
  `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` → đúng 1 giá trị.
- Verify: harness tĩnh (`scratchpad/score-harness.html`) nạp `main.css` +
  `room.css` thật với markup `.score-table` + 2 hàng dữ liệu, screenshot Chromium
  420px — các cột Tên/T/B/H tách rõ, header có gạch chân, bảng không tự tạo khung
  ngoài. Không có test tự động client-side (CLAUDE.md đã nêu).

## Decision

Thuần CSS, phạm vi 1 component. Không đụng `renderScoreTable`
(`client/js/room-ui.js`) hay markup `room.html`. Tracking entry #162 chỉ có trên
`dev` (`git show main:TODO.md | grep '#162'` rỗng) ⇒ theo ngoại lệ git-workflow:
`fix/score-table-column-grid` off `dev`, merge lại vào `dev` (không đụng `main`).

## Summary output

Bảng điểm phòng chơi giờ có lưới dọc giữa các cột + gạch chân header, dễ dò
hàng/cột; không thêm viền ngoài. `?v=163`. Merge vào `dev`.
