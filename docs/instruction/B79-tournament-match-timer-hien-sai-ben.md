# B79 — Đồng hồ trận đấu giải đấu hiện sai bên (hướng dẫn thực thi)

Nguồn: báo cáo người dùng, TODO.md #79 (2026-08-09).

## Bối cảnh kỹ thuật (đã xác nhận qua code, không suy diễn)

Mô hình đúng đắn: server tính giờ (`TimerManager`), client chỉ hiển thị lại —
không cần đổi mô hình này. Lỗi nằm hoàn toàn ở phía **client**, tại
`client/js/tournament-match.js`:

- `renderHeader()` (dòng 381-382) gán `clock-black-name`/`clock-white-name`
  theo **vị trí mảng cố định** `gameState.players[0]`/`[1]`.
- `applyTimerSync()`/render timer (dòng 518-523) gán `clock-black-time`/
  `clock-white-time` theo `timerValues.black`/`.white` — giá trị này đến từ
  server, khoá theo `pairing.player1EntryId`/`player2EntryId` **cố định
  suốt cả series** (xem `PairingLifecycle.js:287-288`), KHÔNG theo màu quân
  thực tế của ván hiện tại.

Trong khi đó màu quân thực tế của mỗi seat lại đổi theo 2 cơ chế:

1. Swap2 choice (`GameEngine._assignColors`, `server/managers/GameEngine.js:375-378`)
   — có thể khiến `players[0]` cầm Trắng.
2. Xoay seat mỗi ván trong series (`startMatch()`,
   `server/socket/handlers/TournamentMatchHandler.js:218-220`) — `players[0]`
   là entry khác nhau tuỳ ván chẵn/lẻ.

## Cách làm

Nguồn sự thật duy nhất về "ai đang cầm Đen/Trắng" phải là
**`gameState.players[i].color`** (server đã set đúng, đã có sẵn trong payload
`tmatch:init`/`tmatch:moved`/`tmatch:swap2_state` qua `engine.serialize()`),
không phải chỉ số mảng `i`. Sửa `renderHeader()` để tra theo `.color` thay vì
theo vị trí:

```js
const black = gameState.players.find(p => p.color === 'BLACK');
const white = gameState.players.find(p => p.color === 'WHITE');
document.getElementById('clock-black-name').textContent = black ? black.displayName : '—';
document.getElementById('clock-white-name').textContent = white ? white.displayName : '—';
```

- **Trường hợp Swap2 chưa chọn xong màu** (`color` vẫn `null` ở cả 2 seat,
  `openingPhase` chưa `'play'`): `black`/`white` sẽ đều `undefined` — giữ
  nguyên fallback `'—'` hiện có cho panel tên, đồng thời cân nhắc hiện rõ
  trạng thái "chưa xác định" thay vì hiện trắng trơn gây hiểu lầm là bug —
  không bắt buộc, nhưng nên làm cho nhất quán với các chỗ khác của trang đã
  xử lý `openingPhase` (`renderSwap2Banner()`).
- **`matchTitleEl`** (dòng 363: `${p1.displayName} vs ${p2.displayName}`) và
  **`slot1NameEl`/`slot2NameEl`** (dòng 364-365) vẫn có thể tiếp tục dùng thứ
  tự seat `p1`/`p2` như cũ — 2 chỗ này không có chấm màu đen/trắng đi kèm nên
  không mang ý nghĩa "đây là người cầm Đen/Trắng", không cần sửa. Chỉ 2 dòng
  `clock-black-name`/`clock-white-name` (và bất kỳ chỗ nào khác gắn icon
  `match-stone-dot--black`/`--white`) mới cần tra theo `.color`.
- Timer **giá trị số** (`timerValues.black`/`.white`, dòng 518-523) không cần
  sửa gì — nó vốn đã đúng theo entryId cố định phía server; vấn đề chỉ là
  panel *tên* đang bị gắn sai vị trí. Sau khi tên panel tra đúng theo
  `.color`, cặp (tên, giờ) trên cùng 1 panel `clock-black`/`clock-white` sẽ tự
  khớp lại — vì cả `TimerManager` slot và `GameEngine.players[].color` đều
  cùng phản ánh đúng ai đang cầm quân gì tại thời điểm đó (chỉ khác nhau ở
  chỗ TimerManager không "biết" khái niệm màu quân, nó chỉ theo entryId; còn
  client trước đây tra sai theo seat thay vì theo *cùng 1 nguồn* — sửa client
  tra theo `.color` phía GameEngine, vốn luôn nhất quán với slot mà server
  dùng để `switchTurn()`/`addTime()`, xem `TournamentMatchHandler.js`'s
  `_timerSlotForUser()`).

## Bẫy cụ thể

- Đừng đổi `TimerManager`/`PairingLifecycle.js` — thiết kế "black/white slot
  cố định theo entryId suốt series" là **cố ý** (comment tại
  `TournamentMatchHandler.js:214-216`), không phải bug. Đổi nó sẽ làm hỏng
  logic cộng giờ (`addTime`)/tính giờ mỗi lượt vốn đang đúng.
- Đừng đổi thứ tự `gameState.players` hay cách `startMatch()` xoay seat mỗi
  ván — đó cũng là thiết kế cố ý (màu quân xoay vòng công bằng trong series).
- Kiểm tra tất cả các vị trí khác trong `tournament-match.js` có giả định
  "player[0] = Đen" tương tự trước khi coi là xong — ví dụ nếu có chỗ nào
  dùng seat để tô màu quân trên bàn cờ hay để xác định lượt hiển thị, cần rà
  lại cùng cách.
- Verify lại bằng trận thật có bật Swap2 (để P2 chọn "black") VÀ một series
  ≥2 ván (để qua ván 2) — 2 kịch bản độc lập, cần test riêng từng cái, không
  chỉ test 1 trong 2 rồi coi là đã phủ hết.

## Không thuộc phạm vi (đừng gộp vào fix này)

- Không đổi mô hình server-authoritative timer hay cách client nội suy giờ
  cục bộ giữa các lần sync (`tickLocal`/`applyTimerSync`) — phần đó hoạt
  động đúng, không liên quan tới bug "sai bên".
- Không đổi hành vi reconnect (`resyncOnConnect`/`tmatch:subscribe`) — nó chỉ
  gửi lại đúng state hiện có; một khi state đó đúng (sau khi sửa client), nó
  sẽ tự đúng theo mà không cần sửa riêng.
