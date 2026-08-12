# #103 — Luật WALL: nước thứ 2 của người chơi 1 phải cách nước thứ 1 khoảng cách Chebyshev ≥ 4

**Trạng thái:** ✅ ĐÃ XONG (2026-08-11)

**Addendum (2026-08-12):** merge ban đầu chỉ đổi `server/`, quên thêm i18n key
`err.wall_second_move_min_distance` cho mã lỗi `WALL_SECOND_MOVE_MIN_DISTANCE` —
client hiện chuỗi khoá thô thay vì thông báo dịch. Đã vá, xem
[fix-log](../fix-log/2026-08-12-todo-103-followup-wall-second-move-i18n-key.md).

## Yêu cầu người dùng (2026-08-11)

> Nước thứ 2 của người chơi 1 phải đặt cách nước thứ 1 của họ đúng khoảng cách Manhattan = 4 (hoặc
> ≥ 4 — đây là điểm tôi không chắc).

**Làm rõ (2026-08-11):** Sau xác nhận của người dùng, rule dùng **Chebyshev distance** (không phải Manhattan),
với ngưỡng **≥ 4**. Công thức: `max(|x2−x1|, |y2−y1|)` — tính theo 8 hướng (cả đường chéo), khác với
Manhattan chỉ tính hàng và cột.

**Câu hỏi còn lại đã được xác nhận (2026-08-11), qua `AskUserQuestion`:**
1. Ngưỡng: **≥ 4** (không phải đúng bằng 4).
2. Phạm vi áp dụng: **bất cứ khi nào chế độ WALL đang bật** (kể cả biến thể "Hole") — tức cùng điều
   kiện `this.walls.length > 0` đã dùng cho ràng buộc nước-đầu-tiên hiện có, không cần điều kiện
   riêng.
3. Tương tác với Swap2: **không áp dụng khi `ruleSwap2` bật**, vì theo người dùng, Swap2 mặc định
   tắt WALL. Trong code, điều này tự động đúng vì `makeMove()` chặn toàn bộ nước đi thường
   (`SWAP2_IN_PROGRESS`) trong lúc khai cuộc Swap2 chưa xong — nước 2 quân liên tiếp của P1 trong
   `place3` đi qua `placeOpeningStone()`, không qua `makeMove()`, nên rule mới hoàn toàn không chạm
   vào luồng đó.

## Triển khai

Đã thêm kiểm tra trong `makeMove()` (`GameEngine.js`, ngay sau khi xác định `player`/`colorStr`,
trước khi đặt quân lên bàn): khi `this.walls.length > 0` và người đi là `players[0]` (người chơi 1),
lọc `moveHistory` theo `color === colorStr` để tìm nước đi trước đó của riêng họ; nếu đây là nước
thứ 2 của họ (`player1Moves.length === 1`) và `max(|dx|, |dy|) < 4`, trả về lỗi với mã
`WALL_SECOND_MOVE_MIN_DISTANCE` (theo đúng khuôn mẫu `{ error, code }` của
`SWAP2_FIRST_MOVE_MUST_BE_ADJACENT_WALL`), không đổi cấu trúc trả về hiện tại của `makeMove()`.

**Test:** 10 test case mới trong `server/tests/GameEngine.test.js` (describe block "WALL rule: P1
2nd move min Chebyshev distance") — boundary (Chebyshev 3/4/5, không giới hạn trần), phân biệt rõ
Chebyshev vs Manhattan (case `dx=2,dy=2` — Manhattan=4 nhưng Chebyshev=2 → phải bị từ chối), đối
xứng theo hướng âm, không ảnh hưởng P2, không áp dụng khi WALL tắt, không áp dụng cho nước thứ 3+
của P1. Toàn bộ 56 test trong file (kể cả 46 test cũ) đều pass.

## Bối cảnh trong code hiện tại

`server/managers/GameEngine.js` đã có cơ chế ràng buộc nước đi mở đầu cho chế độ **WALL** (tường):
khi `this.walls.length > 0 && this.moveCount === 0`, nước đầu tiên bắt buộc phải nằm trong
`firstMoveZones` (`GameEngine.js:175-181`, mã lỗi `SWAP2_FIRST_MOVE_MUST_BE_ADJACENT_WALL`). Đây là
ràng buộc cho **nước thứ 1**. Yêu cầu này (#103) là một ràng buộc **mới**, cho **nước thứ 2 của
người chơi 1** (tức nước thứ 3 toàn ván, vì thứ tự là P1 nước 1 → P2 nước 1 → P1 nước 2) — hiện
`makeMove()` không có logic nào kiểm tra khoảng cách Chebyshev giữa 2 nước đi bất kỳ.

Lưu ý: `ruleSwap2` (Swap2 opening, `GameEngine.js:52-55, 84, 116-129`) là một luật khai cuộc khác,
không liên quan trực tiếp — nhưng nếu WALL rule cũng có thể bật cùng lúc với Swap2, cần làm rõ nước
"thứ 2 của người chơi 1" nghĩa là gì trong ngữ cảnh Swap2 (nơi P1 đặt 2 quân liên tiếp trong
`place3`) trước khi implement.

## Việc cần làm (khi được xác nhận)

1. Hỏi lại người dùng: đúng bằng 4 hay ≥ 4.
2. Làm rõ luật này áp dụng khi nào — luôn luôn, hay chỉ khi chế độ WALL (có tường) đang bật giống
   ràng buộc nước-đầu-tiên hiện có?
3. Làm rõ tương tác với `ruleSwap2` nếu cả 2 luật cùng bật.
4. Thêm kiểm tra khoảng cách Chebyshev `max(|x2-x1|, |y2-y1|)` giữa nước đầu và nước thứ 2 của cùng
   người chơi 1 trong `makeMove()`, kèm mã lỗi mới (theo khuôn mẫu `SWAP2_FIRST_MOVE_MUST_BE_ADJACENT_WALL`).
5. Unit test theo `server/tests/GameEngine.test.js` — basic case (đúng/không đúng khoảng cách) +
   boundary case (khoảng cách 3, 4, 5 nếu là `≥ 4`; và các trường hợp đối xứng tạo cùng khoảng cách
   Manhattan).

Xem hướng dẫn thực thi tại [instruction B103](../instruction/B103-wall-rule-nuoc-thu-2-manhattan-khoang-cach-4.md).
