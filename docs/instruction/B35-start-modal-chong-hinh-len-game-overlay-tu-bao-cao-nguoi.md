# B35. `#start-modal` chồng hình lên `#game-overlay` (từ báo cáo người dùng, 2026-08-03)

### B35. `#start-modal` chồng hình lên `#game-overlay` (từ báo cáo người dùng, 2026-08-03)

- **Tái hiện trước, đừng sửa theo suy đoán** — giả thuyết nguyên nhân gốc ở
  `TODO.md` #35 đọc từ code, chưa chạy Playwright xác nhận. Viết kịch bản
  2 trang (2 người chơi thật, không phải 1 trang giả lập 2 người) chơi hết 1
  ván, sau đó **chỉ 1 trong 2** bấm "Đấu lại" (`#btn-rematch`), chụp lại
  trạng thái DOM của trang còn lại — xác nhận đúng cả `#start-modal` và
  `#game-overlay` cùng có class `.visible` tại cùng 1 thời điểm trước khi
  chọn hướng sửa.
- **Việc phụ cần làm trước, không bỏ qua:** đối chiếu comment ở
  `server/socket/state.js:342` ("Called after every mutation that can affect
  it (sit, stand, kick, leave, settings change, confirmStart, **game
  end**)") với thực tế `handleGameEnd` (`server/socket/handlers/
  GameHandler.js:640`) — hàm này **không** gọi `syncReadyWindow`. Cần xác
  định đây là tài liệu lỗi thời (hành vi đúng, comment sai) hay đúng là thiếu
  1 lệnh gọi (bug khác, độc lập với B35) — không tự ý sửa `handleGameEnd` chỉ
  vì thấy comment không khớp, vì có thể comment mới là cái cần sửa.
- **Hướng sửa gợi ý (chưa chốt, chọn sau khi tái hiện xong):**
  - (a) Rẻ nhất, chỉ sửa hiển thị: trong `renderStartModal()`
    (`client/js/room-ui.js:202`), thêm điều kiện không hiện nếu
    `#game-overlay` đang có class `.visible` (kiểm tra DOM trực tiếp, hoặc
    thêm 1 cờ state `st.gameOverlayVisible` được set/gỡ đúng lúc trong
    `showGameOverlay()`/khi bấm "Đóng"/"Đấu lại").
  - (b) Đúng gốc hơn: không cho `readyDeadline` được set trong lúc
    `#game-overlay` còn đang chờ người dùng đóng — tức chặn từ phía server
    (trong `syncReadyWindow`) hoặc trì hoãn tới khi cả 2 phía đã dismiss
    overlay. Rủi ro cao hơn (a) vì đụng luồng ready-window dùng chung cho cả
    lượt chơi đầu tiên (không chỉ rematch).
  - **Khuyến nghị chọn (a) trước** — cùng tinh thần "sửa ở lớp hiển thị,
    không đụng state server" đã áp dụng cho mục 18 hướng 2 (overlay che UI
    vỡ) — trừ khi tái hiện cho thấy (a) không đủ.
- **Không đụng:** luồng `confirmStart`/`syncReadyWindow` cho lượt chơi ván
  ĐẦU TIÊN của phòng (trước khi có `game:ended` nào) — đó là hành vi đúng,
  không phải nguồn gốc bug này.
- Test: theo rule "Bug-fix workflow" — nếu chọn hướng (a), thêm test đơn vị
  cho phần logic thuần (nếu tách được hàm quyết định visible ra khỏi DOM) hoặc
  test bằng Playwright dựng đúng kịch bản 2 trang ở trên (client-side hiện
  chưa có unit test framework, ghi rõ theo đúng luật CLAUDE.md nếu không tách
  được phần thuần để test qua Jest).

**✅ ĐÃ SỬA (2026-08-03) — xem TODO.md #35.** Tái hiện xong bằng Playwright
trước khi sửa (đúng yêu cầu ở trên) — xác nhận cả `#start-modal` và
`#game-overlay` cùng `.visible` khi 1 người bấm "Đấu lại" trước người kia.

**Đã đổi hướng so với gợi ý ban đầu, sau khi thảo luận trực tiếp với người
dùng** — không chỉ chọn (a) hay (b) như liệt kê ở trên, mà đổi luôn mô hình:
Start Modal chỉ còn kích hoạt bởi đúng 1 sự kiện — "tôi vừa ngồi vào chỗ"
(ngồi lần đầu, hoặc đứng dậy rồi ngồi lại) — thay vì suy ra từ
`readyDeadline` gián tiếp qua broadcast. Cụ thể:
- Bấm "Đóng" (`btnCloseOverlay`, `client/js/room.js`) giờ **đứng dậy thật**
  (`room:stand`) thay vì chỉ ẩn overlay — người dùng đề xuất ý này, lý do
  chọn: xoá hẳn trạng thái lửng lơ "còn ngồi, chưa ready, không có hạn" mà
  bug này dựa vào, không chỉ che triệu chứng ở tầng hiển thị. Không cần tạo
  event mới — tái dùng đúng `roomManager.standUp()` đã có.
- **Vẫn giữ (a) làm phòng thủ chiều sâu**, không thay thế: `renderStartModal()`
  vẫn gate thêm bằng `#game-overlay` có `.visible` hay không, đề phòng đường
  khác (không phải rematch) cũng có thể set `readyDeadline` sớm mà chưa
  lường hết.
- Việc phụ (comment ở `state.js:342` không khớp `handleGameEnd`) đã xem lại
  — **không sửa**, vì hướng sửa trên loại bỏ triệu chứng mà không cần
  `handleGameEnd` tự gọi `syncReadyWindow`; không có bằng chứng cụ thể nào
  khác đang phụ thuộc vào đúng câu chữ của comment đó để buộc phải sửa theo.
- Test: `e2e/rematch-overlay-conflict.spec.ts` (Playwright, đúng kịch bản 2
  trang ở trên) — client vẫn chưa có unit test framework nên đây là guard
  duy nhất, đúng như dự đoán ở trên. Mutation-check: revert tạm 2 đoạn sửa
  trên bản copy → đỏ đúng dòng assert bắt bug; khôi phục → xanh.
