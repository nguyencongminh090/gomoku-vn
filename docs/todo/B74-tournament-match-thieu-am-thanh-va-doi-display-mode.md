# Phần B #74. Trận đấu giải đấu (`tournament-match.html`) không có âm thanh, không đổi được Display (Paper/Stone)

**Nguồn:** báo cáo người dùng — "User in Tournament room cannot set Display (Paper/Stone) and no
sound" (2026-08-08). Xác nhận bằng cách đọc `tournament-match.html`, `tournament-match-entry.js`,
`tournament-match.js`, `settings-panel.js`, `room-ui.js`, `audio-manager.js`, `room-socket.js`.

## Vấn đề đã xác nhận

Đây là 2 gap khác nhau, cùng nguyên nhân gốc: khi xây trận đấu trong giải đấu (B50), trang
`tournament-match.html` được dựng như 1 trang riêng, **không tái sử dụng toàn bộ hạ tầng của
`room.html`** — chỉ có bảng cờ + panel Nước đi/Khán giả, không có tab "Cài đặt" (Room Settings) và
không load `audio-manager.js`.

### 1. Không có UI đổi Display (Paper/Stone) trong lúc chơi

- Radio Paper/Stone (`settings.display_paper`/`settings.display_stone`) chỉ tồn tại trong tab
  "Cài đặt" của **phòng thường** (`room-ui.js:321-324`, render vào `#settings-body` bên trong
  `#settings-panel`). `tournament-match.html` **không có `#settings-panel`/`#settings-body`/tab
  "Cài đặt" nào cả** — không phải bị ẩn hay lỗi CSP, mà đơn giản là không tồn tại trong HTML.
- `tournament-match.js:252-254` (`boardDisplayMode()`) đã đọc đúng key `localStorage
  ('play3cr_board_display')` mà `room-ui.js:617` ghi — nên nếu người dùng từng đổi Paper/Stone lúc
  chơi ở phòng thường, giá trị đó áp dụng đúng khi vào trận giải đấu. Nhưng **trong lúc đang ở trận
  giải đấu thì không có cách nào đổi** — comment ngay tại `tournament-match.js:245-251` xác nhận đây
  là quyết định cố ý lúc code B50: *"unlike click-mode there is no in-tournament-match UI to change
  it"*. Tức là hành vi hiện tại đúng như code viết ra, nhưng là 1 khoảng trống UX người dùng đang gặp
  phải thật.
- Khác với `TODO.md #72` (radio bật lại giá trị cũ do CSP chặn `onchange`) — đây **không phải bug
  CSP**, mà là thiếu hẳn control.

### 2. Không có âm thanh trong trận đấu giải đấu

- `client/tournament-match.html` **không có `<script src="js/audio-manager.js">`** trong danh sách
  script (so với `room.html:173` có) → `window.audioManager` không tồn tại trên trang này.
- Dù có load, **`tournament-match.js` không hề gọi `audioManager` ở đâu cả** — không có
  `playMoveSound`/`playWinSound`/`playLoseSound`/`playTimerTickSound` — trong khi
  `room-socket.js:198,282,345,347` gọi đủ 4 hàm đó cho phòng thường. Tournament match tự xử lý socket
  event riêng (`tmatch:init`/`tmatch:moved`/...) thay vì dùng `room-socket.js`, nên không tự động kế
  thừa phần âm thanh.
- Nút Sound toggle trong Global Settings (`settings-panel.js:63-69`, gear icon `.topnav__right`) vẫn
  hiện ra bình thường trên trang này (vì `.topnav__right` tồn tại, `settings-panel.js` được import) —
  nhưng bật/tắt nó không có tác dụng gì vì hoàn toàn không có âm thanh nào được phát ra để tắt/bật.

## Việc cần làm

- **Mục 2 (âm thanh) là bug thật, nên ưu tiên trước** — hành vi mong đợi rõ ràng (mọi trang chơi cờ
  nên có âm thanh nước đi/thắng/thua/hết giờ, đồng nhất với phòng thường), không cần hỏi lại ý đồ:
  - Thêm `<script src="js/audio-manager.js?v=N">` vào `tournament-match.html`.
  - Gọi `window.audioManager.playMoveSound(...)`/`playWinSound()`/`playLoseSound()`/
    `playTimerTickSound()` tại đúng điểm tương ứng trong `tournament-match.js` (nơi xử lý
    `tmatch:moved`, `tmatch:init`/kết quả trận, đồng hồ đếm ngược) — theo đúng logic điều kiện
    `room-socket.js` đang dùng (VD `playMoveSound(!myPlayer || myPlayer.color !== data.color)` để
    phân biệt tiếng nước đi của mình/đối thủ).
- **Mục 1 (Display mode UI) cần hỏi lại người dùng trước khi làm** — vì đây là quyết định thiết kế cố
  ý đã ghi rõ trong code (B50), không phải bug logic. 2 hướng khả dĩ:
  - (a) Thêm hẳn tab "Cài đặt" đầy đủ vào `tournament-match.html` giống `room.html` — nhưng cần làm
    rõ những mục nào (board size, luật thắng, Wall/Portal, Swap2, timer) **không** nên đổi được giữa
    trận đấu giải đấu đang diễn ra (khác phòng thường, các thông số này do giải đấu quyết định từ
    đầu, đổi giữa chừng có thể phá tính công bằng) — chỉ Display mode (thuần thị giác, không ảnh
    hưởng luật chơi) là an toàn để thêm.
  - (b) Thêm riêng 1 control Display (Paper/Stone) nhỏ gọn hơn — VD vào Global Settings panel
    (`settings-panel.js`) thay vì phòng riêng, áp dụng chung mọi trang (kể cả tournament-match) thay
    vì chỉ đổi được từ tab Cài đặt của phòng thường. Hướng này đơn giản hơn (a) và giải quyết đúng gap
    người dùng gặp mà không đụng tới các setting "nguy hiểm" khác của trận giải đấu.
  - Không tự chọn hướng — độ phức tạp UI và rủi ro "đổi setting giữa trận" khác nhau đáng kể giữa 2
    hướng.

## Đánh giá hiệu quả / an toàn

- **Mục 2 (âm thanh):** hiệu quả cao, an toàn cao — thêm script tag + gọi hàm đã có sẵn
  (`audio-manager.js` không đổi), rủi ro thấp.
- **Mục 1 (Display UI):** hiệu quả tuỳ hướng chọn — an toàn thấp rủi ro nếu chọn hướng (b), rủi ro
  trung bình nếu chọn hướng (a) vì thêm cả tab Cài đặt mới cần xác định rõ mục nào khoá lại.

## Trạng thái

Chưa làm — mới ghi nhận theo báo cáo người dùng (theo quy tắc "New requirements/tasks: stack, don't
perform directly" trong `CLAUDE.md`).
