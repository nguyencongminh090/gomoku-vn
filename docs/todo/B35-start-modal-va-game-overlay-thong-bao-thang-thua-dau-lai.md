# Phần B #35. `#start-modal` và `#game-overlay` (thông báo Thắng/Thua/Đấu lại) chồng

**Nguồn:** báo cáo người dùng khi test thủ công (2026-08-03)


35. ~~**`#start-modal` và `#game-overlay` (thông báo Thắng/Thua/Đấu lại) chồng
    lên nhau sau khi ván kết thúc**~~
    **✅ ĐÃ XONG (2026-08-03)** — người dùng xác nhận repro: **lặp lại được ổn
    định** (mọi lần), 2 overlay **chồng hình lên nhau** trực tiếp.
    - **Nguyên nhân gốc, đã xác nhận bằng Playwright (không chỉ giả thuyết
      đọc code):** khi 1 trong 2 người bấm "Đấu lại" trước người kia,
      `game:rematch` (`server/socket/handlers/GameHandler.js:396`) gọi
      `confirmStart` rồi `syncReadyWindow` (vì `allReady` false), set
      `readyDeadline` mới và broadcast `room:updated` tới **cả 2 client**.
      Người **chưa** bấm gì vẫn còn `#game-overlay` hiện, và
      `renderStartModal()` (`client/js/room-ui.js:202`) cũ không kiểm tra
      điều đó trước khi thêm `.visible` vào `#start-modal` → chồng hình.
    - **Hướng sửa đã chọn (thảo luận trực tiếp với người dùng, xem hội
      thoại):** thay vì vá tại điểm hiển thị đơn thuần, đổi luôn mô hình —
      Start Modal chỉ còn 1 nguồn kích hoạt duy nhất: **"tôi đang ngồi vào
      chỗ"**, không phải "phòng có `readyDeadline`" một cách gián tiếp qua
      broadcast. Cụ thể:
      1. **`client/js/room.js` — `btnCloseOverlay`:** trước đây bấm "Đóng"
         chỉ ẩn overlay phía client, không báo gì cho server, để người chơi
         ngồi lại ở trạng thái "còn ngồi nhưng chưa ready" vô thời hạn. Nay
         bấm "Đóng" = **đứng dậy thật** (`window.RoomState.standRequested =
         true; window.RoomClient.emit('room:stand')`) — tái dùng đúng luồng
         `room:stand`/`standUp()` có sẵn cho nút đứng dậy ở ghế, không tạo
         event mới. Hệ quả: `bothSeated` false → `syncReadyWindow` tự huỷ
         ready-window, `readyDeadline` về `null` — không còn trạng thái lửng
         lơ nào để dây vào bug này nữa.
      2. **`client/js/room-ui.js` — `renderStartModal()`:** thêm phòng thủ
         chiều sâu — không hiện `#start-modal` nếu `#game-overlay` đang có
         class `.visible` (đọc DOM trực tiếp), bất kể `readyDeadline` là gì.
         Chặn mọi đường khác (nếu có) có thể dẫn tới cùng bug mà không cần
         lường hết từng đường.
      - **Không đụng:** `btnRematch` (giữ nguyên, chỉ ẩn overlay cục bộ rồi
        emit `game:rematch` — bấm "Đấu lại" khi đang ngồi tương đương xác
        nhận ready, đúng luồng `confirmStart` sẵn có), luồng `syncReadyWindow`
        cho ván đầu tiên của phòng (trước `game:ended` đầu tiên).
      - **Việc phụ đã kiểm, không phải bug riêng:** comment ở
        `server/socket/state.js:342` liệt kê "game end" là 1 mốc phải gọi
        `syncReadyWindow`, nhưng `handleGameEnd` không gọi trực tiếp — không
        cần sửa gì thêm vì hướng sửa trên (gate qua `#game-overlay` +
        đứng dậy khi Đóng) đã loại bỏ hoàn toàn triệu chứng mà không cần
        `handleGameEnd` tự gọi `syncReadyWindow`; để nguyên comment, không
        rõ ràng buộc lịch sử nào khác dựa vào hành vi hiện tại nên không tự
        ý "sửa cho khớp comment".
    - Bump `?v=38` → `?v=39` (đổi `client/js/room.js` + `client/js/
      room-ui.js`).
    - **Test:** file mới `e2e/rematch-overlay-conflict.spec.ts` (Playwright,
      2 case): (1) dựng đúng kịch bản báo cáo — 2 người chơi thật, kết thúc
      ván bằng đầu hàng, PlayerA bấm "Đấu lại" trước, xác nhận PlayerB (chưa
      bấm gì) **không** thấy `#start-modal` hiện trong khi `#game-overlay`
      còn `.visible`, rồi PlayerB bấm "Đóng" và xác nhận `RoomState.mySlot
      === null` (đứng dậy thật) + không phòng nào còn ready-window; (2) case
      hồi quy — 2 ghế mới ngồi vào vẫn hiện Start Modal bình thường (đảm bảo
      fix không vô hiệu hoá tính năng gốc). Chạy trên cả 3 trình duyệt
      (chromium/firefox/webkit) đều xanh.
      **Mutation-check:** revert tạm cả 2 đoạn sửa trên bản copy (không sửa
      file gốc trong lúc kiểm), chạy lại đúng case 1 trên chromium →
      **đỏ đúng ở dòng assert `#start-modal` not visible** (`Received:
      "game-overlay visible"` — bắt được đúng bug được báo cáo), khôi phục
      lại thì xanh. `npm test` (server-side, không đổi) vẫn 359/359 xanh —
      đây là fix thuần client, không đụng code server nào.
      **Client-side hiện chưa có Jest/unit-test framework** (đúng như
      `CLAUDE.md` ghi nhận) nên guard duy nhất cho fix này là e2e Playwright
      ở trên, không có unit test bổ sung.
    - **Đã kiểm bằng browser thật qua Playwright** (không chỉ tin giả định) —
      xem chi tiết Mutation-check ở trên. Chi tiết đầy đủ: `docs/fix-log.md`.
