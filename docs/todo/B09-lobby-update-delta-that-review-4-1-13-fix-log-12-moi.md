# Phần B #9. `lobby:update` → delta thật (review 4.1/13, fix-log #12 mới debounce

**Nguồn:** `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)


9. ~~**`lobby:update` → delta thật** (review 4.1/13, fix-log #12 mới debounce
   nửa vế) — emit patch thay vì full list; client giữ map cục bộ + merge.~~
   **✅ ĐÃ XONG** (2026-08-02, commit `2319546`, merge `e8eac2b`) —
   `broadcastLobbyUpdate` **diff tại lúc flush** với bản ghi "lobby đã được gửi
   gì lần trước", emit `lobby:patch { upserts, removed }`; thêm
   `sendLobbySnapshot()` gửi full list khi `lobby:subscribe` (đúng yêu cầu
   "client join giữa chừng phải nhận snapshot trước"). Client `lobby.js` giữ
   `Map` theo roomId, áp `removed` trước rồi `upserts`. Vì diff tính từ state
   thật nên **không phải sửa ~15 call site** và không call site nào có thể mô
   tả sai/quên. Không đổi gì thì **không gửi gói nào** (trước đây luôn gửi full
   list). Bump `?v=29` → `?v=30`.
   **Phát hiện thêm khi verify: có điểm thứ 18** ngoài danh sách 15 của review —
   `SocketHandler.js:44` (`room_destroyed`) emit thẳng full `lobby:update`, bỏ
   qua debounce và làm baseline delta bị cũ → đã cho đi chung đường
   `broadcastLobbyUpdate`.
   Test: file mới `server/tests/lobby-delta.test.js`, 14 case dùng `state.js`
   **thật** (trước giờ chưa test nào chạm tới, 2 suite kia đều mock), gồm 2 case
   **replay phía client** dựng lại đúng logic merge của `lobby.js` qua chuỗi 6
   trạng thái và so khớp tuyệt đối với list của server. `npm test` 223/223 xanh.
   **Đã kiểm browser thật** (bắt frame WebSocket, 3 host tạo phòng cách nhau
   ~1300ms — đúng nhịp mà debounce không che được): watcher và người vào sau
   thấy list giống hệt nhau, 0 lỗi JS. **Đo thật cùng kịch bản:** trước 3794B/6
   gói → sau **1337B/5 gói**, giảm **64.8%**; càng nhiều phòng càng lợi vì patch
   không phình theo số phòng. Chi tiết: `docs/fix-log.md`.
   **Cập nhật (kiểm chứng `3da53dd`):** debounce 300ms của fix #12 **không đạt
   mục tiêu** ở nhịp người chơi thật (~1200ms giữa các hành động) — vẫn ra 4 gói
   / 10 759B giống hệt trước khi có debounce, vì mỗi hành động rơi vào cửa sổ
   riêng. Chỉ ăn khi hành động dồn dập (<300ms, vd. tạo 10 phòng liên tiếp: 11→4
   gói). Phần tốn thật vẫn là payload (2 670B full-list cho 1 thay đổi), đúng
   như review đã chỉ ra. **Giải pháp rẻ tạm thời:** nâng cửa sổ debounce lên
   1–2s (đổi `LOBBY_UPDATE_DEBOUNCE_MS` ở `state.js`) — 1 dòng, an toàn, che
   được nhịp người thật nhưng không giảm payload. **Giải pháp thật** vẫn là làm
   nốt phần delta ở trên — khi đó cửa sổ debounce bao nhiêu không còn quan trọng.
