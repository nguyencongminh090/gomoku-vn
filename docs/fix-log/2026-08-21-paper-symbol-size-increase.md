# Fix log entry — 2026-08-21 19:55

## Prompt

Người dùng gửi ảnh chụp bàn cờ paper style (nền trắng, X xanh, O đỏ viền) kèm yêu cầu kiểm tra kích
thước X/O bằng bao nhiêu % cell, sau đó yêu cầu tăng kích thước. Thử "Large" trước (X 44%→60%
bounding box, O 48%→66% đường kính), người dùng phản hồi "Big size" quá — chốt lại ở mức "Moderate".

## Action

`client/js/board.js`:
- `_drawBlackPiece()` (X): `arm` 0.22 → 0.28 × `cellSize` (bounding box 44% → 56% cell).
- `_drawWhitePiece()` (O): `radius` 0.24 → 0.30 × `cellSize` (đường kính 48% → 60% cell).
- Giữ nguyên `lineWidth` (14% cellSize, min 2.5px) ở cả hai — chỉ tăng kích thước hình, không tăng
  độ dày nét.

Chỉ đụng đúng 2 hằng số trong `client/js/board.js`; `_drawStonePiece()` (mode "stone", không phải
"paper") không liên quan, không đổi.

## Decision

Bỏ qua mức "Large" (đã thử trước đó, arm 0.30/radius 0.33) theo phản hồi trực tiếp của người dùng
sau khi xem trên trình duyệt thật. Không cần entry TODO.md/instruction.md — người dùng yêu cầu làm
ngay ("Increase size...", rồi "Accept, you can merge this one"), không phải task xếp hàng.

## Summary output

`client/js/` không có test tự động (client-side, đúng theo CLAUDE.md — nêu rõ thay vì bỏ qua âm
thầm). Xác minh bằng mắt qua trình duyệt (người dùng tự xem, chốt "Accept"). `?v=134→135`
(chỉ đụng `client/js/board.js`, không đụng CSS). Verify:
`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` ra đúng 1 giá trị (`135`).
`fix/paper-symbol-size-increase` off `main`, PR → `main`, merge, sync sang `dev`.
