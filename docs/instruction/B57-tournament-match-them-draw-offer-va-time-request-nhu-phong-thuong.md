# #57. Trận đấu giải đấu — thêm Cầu hoà và Xin cộng giờ như phòng thường

## Quyết định (chốt với người dùng, 2026-08-07)

- **Xin cộng giờ tính theo từng ván** trong series, không tính chung cho cả
  trận đấu — mỗi ván mới bắt đầu (mỗi lần `startMatch()` chạy, tức mỗi lần
  `TournamentMatchHandler.js` tạo một `match` mới trong `tournamentGameMap`)
  tự động có bộ đếm `_timeRequestsUsed`/`_timeRequestPending` mới, không cần
  reset thủ công thêm ở đâu khác — vì `_endMatch()` đã xoá key khỏi
  `tournamentGameMap` trước khi ván kế tiếp tạo `match` object mới.
- **Dùng chung `config.TIME_REQUEST_FREE`/`config.TIME_REQUEST_BONUS`** với
  phòng chơi thường (`server/config.js`) — không thêm config riêng cho giải
  đấu.
- **Cầu hoà: 2 người chơi tự thoả thuận**, không cần organizer duyệt — dùng
  y hệt cơ chế `GameEngine.offerDraw/acceptDraw/declineDraw` (đã có sẵn,
  không phụ thuộc `RoomManager`) như phòng thường.

## Cách triển khai

- `GameEngine.offerDraw/acceptDraw/declineDraw` (server/managers/GameEngine.js)
  đã độc lập với `RoomManager` từ trước — dùng thẳng, không cần sửa.
- Xin cộng giờ **không có sẵn ở GameEngine** (logic nằm trong
  `GameHandler.js`'s `game:request_time` cùng `room._timeRequestsUsed`/
  `room._timeRequestPending`) — với tournament match, state tương đương này
  được gắn lên chính `match` object trong `tournamentState.tournamentGameMap`
  (không có "room" object để mượn), khởi tạo trong `startMatch()`.
- Xác định "màu" (`black`/`white`) cho `TimerManager.addTime()` bằng
  `entryId === pairing.player1EntryId ? 'black' : 'white'` — **không** dùng
  `engine` màu BLACK/WHITE (màu đó đổi theo từng ván trong series, còn slot
  đen/trắng của `TimerManager` cố định theo `player1EntryId`/`player2EntryId`
  suốt cả series) — xem cách `tmatch:move` handler đã làm y hệt việc này
  (dòng ~465-467 file gốc trước khi sửa).
- Client (`tournament-match.js`) tái dùng nguyên `game.btn_draw`/`game.btn_time`/
  `game.draw_offer`/`game.time_offer`/... key i18n đã có sẵn trong `i18n.js`
  (không thêm `tmatch.*` key mới) — cùng nghĩa, không cần bản dịch riêng cho
  màn hình giải đấu.
- CSS `.btn-game--draw`/`.btn-game--time`/`.draw-prompt`/`.btn-draw-action`
  đã có sẵn trong `game.css` và đã được `tournament-match.html` load từ fix
  #52 — không cần CSS mới.
- Không port `renderGameControls()`/`renderDrawPrompt()`/`renderTimePrompt()`
  từ `game-ui.js` nguyên khối — file đó gắn chặt với `window.RoomState`
  (xem header cũ của `tournament-match.js` giải thích lý do không reuse
  `game-ui.js`). Viết bản rút gọn ngay trong `tournament-match.js`, theo đúng
  pattern đã dùng cho `renderSwap2Banner()`/chat trong file này.

## Việc không làm (ngoài phạm vi #57)

- Không thêm bước organizer duyệt cầu hoà.
- Không thêm config riêng biệt số lần xin cộng giờ cho giải đấu.
- Không đổi cách tính điểm/kết quả series khi có cầu hoà (hoà tính như hiện
  tại — `winner: 'draw'` đi qua `_endMatch()`/`recordPairingResult()` y hệt
  đường board-full-draw đã có).
