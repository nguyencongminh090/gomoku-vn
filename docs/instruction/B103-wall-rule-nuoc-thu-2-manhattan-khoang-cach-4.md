# B103 — Hướng dẫn thực thi: luật WALL nước thứ 2 cách nước thứ 1 (Chebyshev)

**Trạng thái:** Đã làm (2026-08-11) — xem tóm tắt triển khai ở
[chi tiết TODO B103](../todo/B103-wall-rule-nuoc-thu-2-manhattan-khoang-cach-4.md).

## Các câu hỏi đã chốt trước khi code (qua `AskUserQuestion`)

- **Ngưỡng và metric:** người dùng tự nói ban đầu chưa chắc — sau khi hỏi lại, chốt: dùng
  **Chebyshev distance** (`max(|dx|, |dy|)`, không phải Manhattan/`|dx|+|dy|`), ngưỡng **≥ 4**
  (không phải đúng bằng 4).
- **Phạm vi áp dụng:** áp dụng **bất cứ khi nào chế độ WALL đang bật** (kể cả biến thể "Hole") —
  cùng điều kiện `this.walls.length > 0` mà ràng buộc nước-đầu-tiên hiện có
  (`GameEngine.js:175-181`) đã dùng, không cần thêm điều kiện riêng.
- **Tương tác với Swap2:** **không áp dụng khi `ruleSwap2 === true`** — người dùng xác nhận Swap2
  mặc định tắt WALL. Về mặt code, điều này tự động đúng: `makeMove()` chặn toàn bộ nước đi thường
  bằng `SWAP2_IN_PROGRESS` chừng nào `openingPhase !== 'play'`; 2 quân P1 đặt liên tiếp trong giai
  đoạn `place3` đi qua `placeOpeningStone()`, một hàm hoàn toàn khác, không qua `makeMove()` — nên
  rule mới không cần thêm guard riêng cho trường hợp Swap2.

## Vị trí code đã thêm

Nằm trong `makeMove()` (`GameEngine.js`), ngay sau khi xác định `player`/`colorStr`, trước khối
"Place stone" — cùng khuôn mẫu trả về `{ error, code }` như `SWAP2_FIRST_MOVE_MUST_BE_ADJACENT_WALL`,
không đổi cấu trúc trả về hiện tại của `makeMove()`. Theo dõi nước đi riêng của người chơi 1 bằng
cách lọc `this.moveHistory` theo `color === colorStr` (không dùng `this.moveCount` toàn cục, vì nó
đếm cả 2 người chơi cộng lại) — khi độ dài mảng lọc được là 1 (tức họ sắp đặt nước thứ 2), so
`max(|x2−x1|, |y2−y1|)` với nước đầu của chính họ; nếu `< 4` thì trả lỗi mã
`WALL_SECOND_MOVE_MIN_DISTANCE`.

## Test đã viết

10 test case trong `server/tests/GameEngine.test.js` (describe "WALL rule: P1 2nd move min
Chebyshev distance"), theo "Writing comprehensive test cases": boundary tại Chebyshev 3 (từ chối)
/ 4 (chấp nhận, đúng ngưỡng) / 5 và một khoảng cách lớn hơn (chấp nhận, xác nhận không có trần vì
là `≥4`); một case phân biệt rõ Chebyshev với Manhattan (`dx=2,dy=2` → Manhattan=4 nhưng
Chebyshev=2 → phải bị từ chối, để khoá lại đúng metric); một case đường chéo đạt đúng ngưỡng
(`dx=4,dy=4`); một case đối xứng theo hướng âm; và 3 case xác nhận phạm vi không lan ra ngoài ý
định (không ảnh hưởng P2, không áp dụng khi WALL tắt, không áp dụng cho nước thứ 3+ của P1).
