# B74. Trận đấu giải đấu thiếu âm thanh + không đổi được Display mode (TODO.md #74)

**Nguồn:** báo cáo người dùng, TODO.md #74.

## Cách tiếp cận

- 2 mục trong [docs/todo/B74](../todo/B74-tournament-match-thieu-am-thanh-va-doi-display-mode.md) có
  độ chắc chắn khác nhau — xử lý khác nhau:
  - **Mục 2 (âm thanh):** đây là gap rõ ràng không cần hỏi lại — `tournament-match.js` tự xử lý
    socket event riêng nên không tự kế thừa phần gọi `audioManager` mà `room-socket.js` đã có. Chỉ
    cần thêm script tag + gọi đúng hàm ở đúng chỗ, theo khuôn mẫu `room-socket.js:198,282,345,347`.
    An toàn để làm thẳng nếu người dùng xác nhận "fix it now".
  - **Mục 1 (Display mode UI):** đây là quyết định thiết kế cố ý từ B50 (xem comment
    `tournament-match.js:245-251`), không phải bug — **phải hỏi lại người dùng** muốn hướng (a) tab
    Cài đặt đầy đủ hay (b) control gọn trong Global Settings, trước khi code, vì rủi ro khác nhau
    (đổi setting "nguy hiểm" giữa trận đang diễn ra).
- Nếu làm mục 1 hướng (a): **không** để người chơi đổi board size/luật thắng/Wall-Portal/Swap2/timer
  giữa trận đấu giải đấu đang diễn ra — các thông số này do giải đấu cố định từ đầu, khác phòng
  thường. Chỉ Display mode (Paper/Stone) là thuần thị giác, an toàn để đổi giữa chừng.
- Nếu làm mục 1 hướng (b): thêm vào `settings-panel.js` cạnh Sound toggle (dòng ~195) — dùng lại đúng
  key `localStorage['play3cr_board_display']` mà `room-ui.js:617` đang ghi và
  `tournament-match.js:252-254` đang đọc, không tạo key mới song song.
- Kiểm tra kỹ: đổi Display mode giữa chừng có cần re-render `boardRenderer` ngay lập tức không (không
  chỉ lưu localStorage rồi chờ F5) — nếu chọn hướng (b) áp dụng live trong game đang mở, cần gọi lại
  `initBoard()`/method tương ứng của `BoardRenderer` để áp dụng ngay, không chỉ đổi cho lần load sau.
- Vì đổi `client/js/*.js` (và có thể `client/tournament-match.html`), nhớ bump `?v=N` theo `CLAUDE.md`
  và chạy lại grep verify.
- Verify bằng browser thật: vào 1 trận giải đấu thật (cần dựng giải đấu + 2 người chơi qua Playwright
  hoặc thủ công), nghe/xem console log xác nhận âm thanh phát đúng lúc đi quân/thắng/thua/hết giờ, và
  xác nhận Display mode đổi được (nếu làm mục 1) — không chỉ đọc code là coi xong, theo "Feature
  completion checklist" trong `CLAUDE.md`.
