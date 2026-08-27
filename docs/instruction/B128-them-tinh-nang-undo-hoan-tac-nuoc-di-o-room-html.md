# B128. Tính năng Undo trong `room.html` (TODO.md #128)

Toàn bộ quyết định thiết kế đã chốt qua thảo luận ở `features/undo/user_story.md` +
`features/undo/planning.md` — đọc 2 file đó trước khi bắt đầu, tài liệu này chỉ tóm tắt trình tự
triển khai + ranh giới + thuật toán lõi.

## Thuật toán lõi — đọc kỹ trước khi viết code

Quy tắc người dùng chốt: **"Undo to requester turn"** — Undo được chấp nhận luôn đưa trạng thái về
ngay trước nước đi gần nhất của chính người yêu cầu, đưa lượt về lại người yêu cầu. Đây là **thuật
toán suy ra ở giai đoạn planning, chưa phải code đã có** — đối chiếu lại với `GameEngine.js` thật
khi viết:

1. `requestUndo(userId)`: tìm `targetIndex` = vị trí (index) trong `moveHistory` của nước đi **gần
   nhất thuộc về người yêu cầu** (`moveHistory.findLastIndex` theo màu quân của họ). Lưu
   `this.undoOffer = { from: userId, targetIndex }`. Snapshot **lúc gửi yêu cầu**, không tính lại lúc
   accept — đây là điều làm quyết định #9 (không chặn luồng chơi) đúng: nếu đối thủ đi thêm trước khi
   được chấp nhận, `targetIndex` vẫn trỏ đúng nước gốc của người yêu cầu, nên accept vẫn xoá đúng cả
   nước đó **và** nước đáp trả sau nó. Nhờ auto-cancel có điều kiện (mục dưới), tối đa chỉ có thêm
   **đúng 1** nước tích luỹ sau `targetIndex` trước khi accept/decline — không có trường hợp phải xử
   lý lùi vô hạn.
2. Từ chối yêu cầu nếu người yêu cầu **chưa có nước đi nào** trong `moveHistory` (chưa từng đi trong
   ván này — không có gì để hoàn tác về).
3. `acceptUndo(userId)`: cắt `moveHistory` về đúng `targetIndex` phần tử, reset `board[y][x] = EMPTY`
   cho từng nước bị xoá, giảm `moveCount` tương ứng, đặt `currentTurn = undoOffer.from`, xoá
   `undoOffer`, gọi `timer.switchTurn(requesterColor)`.
4. `declineUndo(userId)`: chỉ xoá `undoOffer`, không đổi bàn cờ/lượt đi (giống hệt `declineDraw`).
5. Trong `makeMove(userId, ...)`: nếu `this.undoOffer && this.undoOffer.from === userId` → xoá
   `this.undoOffer` **trước khi** xử lý nước đi (auto-cancel, quyết định #9). **Không** xoá khi
   người đi là đối thủ — khác với `drawOffer` bị xoá vô điều kiện ở mọi nước đi
   (`GameEngine.js:216`), đừng copy nguyên logic đó sang Undo.
6. Chặn tự chấp nhận/tự từ chối yêu cầu của chính mình — giống `acceptDraw`/`declineDraw`
   (`GameEngine.js:464`, `:485`).

## Trình tự triển khai đề xuất

1. **`GameEngine.js` trước tiên** (nền cho mọi bước sau, viết test trước khi đụng socket
   handler/UI):
   - `requestUndo`/`acceptUndo`/`declineUndo` theo thuật toán trên.
   - Auto-cancel có điều kiện trong `makeMove()`.
   - Thêm `undoOffer: this.undoOffer` vào `serialize()` (`GameEngine.js:515-542`) — bắt buộc cho
     quyết định #8 (reconnect phải thấy yêu cầu đang chờ). Kiểm tra lại: hiện `drawOffer` **không**
     có trong `serialize()`, đây là khoảng trống có sẵn — đừng chỉ copy nguyên `serialize()` cũ mà
     quên thêm field mới.
   - Unit test (`server/tests/GameEngine.test.js`, pattern-match theo test có sẵn cho
     `offerDraw`/`acceptDraw`/`declineDraw` và `makeMove`): happy path xin lúc đối thủ chưa đáp trả
     (xoá 1 nước) **và** xin lúc đã đến lượt mình lại (xoá 2 nước); tự chấp nhận/tự từ chối bị chặn;
     xin Undo khi chưa từng đi bị chặn; đối thủ đi tiếp **không** huỷ yêu cầu (và accept sau đó vẫn
     đúng); người yêu cầu đi tiếp **có** huỷ yêu cầu; `serialize()` có `undoOffer` khi đang chờ.
2. **`GameHandler.js`**: `game:undo_request`/`game:undo_accept`/`game:undo_decline`, theo đúng khuôn
   `game:draw_offer` block (`GameHandler.js:243-307`). Thêm broadcast mới `game:undo_applied` —
   **không** tái dùng `game:moved` vì đó là payload điền ô (`{x,y,color}`), Undo cần payload xoá ô
   (`cleared: [{x,y}, ...]`, `currentTurn`, `moveCount`). Dòng chat hệ thống theo đúng câu chữ người
   dùng chốt: yêu cầu = `"<tên> xin đi lại."`; đồng ý/từ chối theo mẫu `GAME_DRAW_AGREED`/
   `GAME_DRAW_DECLINED` → `"<tên> đồng ý đi lại."` / `"<tên> từ chối đi lại."`.
3. **Giai đoạn khai cuộc Swap2 (quyết định #6)** — thiết kế riêng, **chưa có trong bước 1**. Giai
   đoạn `openingPhase !== 'play'` không đi qua `moveHistory`/`makeMove()` bình thường
   (`placeOpeningStone()`/`swap2Choice()`, `GameEngine.js` quanh dòng 260-330): place3 đặt 3 quân
   trong 1 hành động của người đặt chỗ đầu tiên, place2 đặt 2 quân của người thứ hai, p1choice/
   p2choice là lựa chọn (không phải toạ độ). Cần xác định rõ với người dùng (hoặc tự quyết định hợp
   lý rồi xác nhận lại) ý nghĩa "1 Undo" cho từng sub-phase trước khi code — không tự suy diễn rồi
   coi là xong.
4. **Client**: listener cho `game:undo_offered`/`game:undo_applied`/`game:undo_declined`, UI xin/
   chấp nhận/từ chối (xem UI draw-offer hiện có trước khi thiết kế mới — có thể tái dùng modal/toast
   pattern), logic render xoá ô bàn cờ (ngược lại với cách `game:moved` hiện đang vẽ quân — tìm đúng
   hàm vẽ hiện tại trước khi viết hàm xoá), đồng bộ `move-tree.js`/`history.js` nếu trang có panel
   lịch sử nước đi đang hiển thị live.
5. Bump `?v=N` toàn bộ theo `CLAUDE.md` cho mọi file `client/css`/`client/js` đã sửa — verify bằng
   `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` còn đúng 1 giá trị.
6. **Xác minh trước khi đánh dấu xong**: `npm test` xanh + xác minh trực tiếp bằng trình duyệt thật
   (2 tab, `run` skill hoặc Playwright tuân `playwright-e2e-safety`) — luồng xin → đối thủ đi tiếp
   → chấp nhận (board/lượt đúng), luồng xin → từ chối, luồng xin → chính mình đi tiếp (auto-cancel,
   nút Undo/prompt biến mất đúng), reconnect giữa lúc đang chờ (người kia vẫn thấy yêu cầu).

## Ranh giới — đừng đụng

- **Đừng tái dùng nguyên logic clear vô điều kiện của `drawOffer`** (`GameEngine.js:216`) cho
  `undoOffer` — Undo cố ý chỉ tự huỷ khi chính người yêu cầu đi tiếp (quyết định #9), không phải mọi
  nước đi của bất kỳ ai.
- **Đừng tính lại `targetIndex` lúc `acceptUndo`** — phải dùng giá trị đã snapshot lúc
  `requestUndo`, nếu không sẽ xoá sai nước khi đối thủ đã đi thêm trong lúc chờ.
- **Đừng thêm hạn mức/bộ đếm số lần Undo** — người dùng đã xác nhận rõ không giới hạn, khác với
  `TIME_REQUEST_FREE`.
- **Đừng mở rộng phạm vi sang trận đấu giải đấu** (`TournamentMatchHandler.js`) — chỉ `room.html`.
- **Đừng bỏ qua bước thêm `undoOffer` vào `serialize()`** — thiếu bước này thì quyết định #8
  (reconnect phải thấy yêu cầu) im lặng không hoạt động, không có lỗi console nào báo.
- **Đừng tự ý thiết kế xong rồi code luôn phần Swap2 (bước 3)** mà không xác nhận lại — đây là phần
  duy nhất trong 9 quyết định chưa có thuật toán cụ thể, chỉ có "vẫn cho phép" làm định hướng.
