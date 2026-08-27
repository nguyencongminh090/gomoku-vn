# Fix log entry — 2026-08-24 01:30

## Prompt

"Do #152" — thực thi `docs/todo/B152-game-move-khong-co-ack-timeout-retry-gay-freeze.md` theo
`docs/instruction/B152-*.md`. Gốc: báo cáo người chơi ở Trung Quốc (2026-08-23), "đôi lúc freeze"
khi đặt quân, phải F5 mới thoát.

## Action

### Server

- `server/socket/state.js`: tách `buildRoomStatePayload(room)` ra khỏi phần dựng `room:joined` inline
  trong `SocketHandler.js` (serializeRoom + `gameState.serialize()` + `timer.getTimers()/getSync()`).
  `SocketHandler.js:233-266` giờ gọi hàm này — **không viết lại logic dựng state**, đúng ranh giới
  "hai đường dựng state khác nhau = hai đường phân kỳ" của file instruction.
- `server/socket/handlers/GameHandler.js`:
  - `socket.on('game:move', (payload, ack) => ...)`. Guard `typeof ack === 'function'` qua helper
    `fail(message, code)`: có ack → trả `ack({error, code})`; không có ack (client cũ còn cache
    `?v=`) → giữ nguyên `socket.emit('game:error')`. Không phát cả hai, tránh hiện lỗi 2 lần.
  - Dedupe theo `moveId` (uuid do client sinh) lưu trong `room._moveAcks` (Map `moveId → movePayload`),
    **chỉ ghi khi nước đi thành công** nên bị chặn trên bởi số nước của ván. Gặp lại `moveId` cũ →
    `socket.emit('game:moved', prev)` **chỉ cho socket gửi lại** + `ack({ok:true, moveCount, duplicate:true})`.
    Không broadcast lại: đối thủ đã nhận bản gốc, phát lại sẽ cho họ `moveCount` lùi ⇒ gap check đọc
    thành desync.
  - Thứ tự: `io.to(roomId).emit('game:moved')` **trước**, `ack({ok:true, moveCount})` **sau** — mất ack
    thì broadcast vẫn đã đi.
  - `handleGameEnd`: `room._moveAcks = null` (cạnh `room._timeRequestPending = null`).
  - Sự kiện mới `game:resync`: `socket.emit('room:joined', buildRoomStatePayload(room))`, chỉ cho
    socket yêu cầu; không ở trong phòng → no-op im lặng.

### Client (`?v=151 → 152`)

- `socket-client.js`: thêm **method mới** `emitAck(event, data, timeoutMs, cb)` →
  `this.socket.timeout(timeoutMs).emit(...)`. **Không đụng `emit()` cũ** (nhiều call site). Comment
  ghi rõ vì sao **không** bật option `retries` toàn cục.
- `game-ui.js`: `onCellClick` gọi `sendMove(x, y)` thay cho bare emit. Máy trạng thái đúng bảng 6 bước
  của `docs/todo/B152-*.md`: sinh `moveId` (`crypto.randomUUID()`, có fallback) → `.timeout(5000)` →
  ack `{ok}` kết thúc / ack `{error}` hiện lý do **không retry** / timeout lần 1 retry **cùng `moveId`**
  / timeout lần 2 dừng + `game:resync` + thông báo.
  - Bổ sung ngoài bảng (đã ghi lý do tại chỗ): timeout mà ván **đã kết thúc** thì bỏ qua thay vì retry
    — nước đi có thể chính là nước thắng, chỉ mất ack; `handleGameEnd` đã xoá `_moveAcks` nên retry sẽ
    nhận `NO_ACTIVE_GAME` cho một nước đi thực ra đã thắng.
- `room-socket.js`: gap detection trong `game:moved` (mục 5). `data.moveCount === prev + 1` → áp bình
  thường; `<= prev` → **bỏ qua** (echo phát lại của retry, áp lại sẽ push trùng vào `moveHistory`);
  `> prev + 1` → `requestResync()` và **không** áp delta. Chỉ nhánh này gap-check; `game:init`,
  `room:joined`, `game:swap2_state`, `game:undo_applied` nạp state đầy đủ nên tự đặt lại baseline —
  đúng bẫy 7 (resync vô hạn). Export `global.RoomSocket = { serverMessage, requestResync }` cho
  `game-ui.js` dùng lại, không nhân bản.
- `i18n.js`: `room.move_retrying` + `room.move_failed`, **cả `vi` lẫn `en`**.
- Bump `?v=151 → 152` toàn bộ `client/*.html` + mọi `import '...?v='` trong `client/js/*.js`. Grep
  kiểm chứng ra **đúng một** giá trị.

## Decision

- **`moveId` chứ không phải dedupe theo nước đi cuối** — theo hướng đã chốt trong file TODO (hướng A
  bị bác bỏ). Test `dedupe survives an opponent move landing between the original and the retry` là
  bản dựng lại chính xác kịch bản đã giết hướng A, giữ làm regression guard vĩnh viễn.
- **Không bật `retries` toàn cục**, không siết `pingInterval`/`pingTimeout`, không đụng debounce
  `broadcastRoomUpdate`, không mở rộng ack sang sự kiện khác — đúng mục "đừng làm".
- **Replay chỉ cho socket gửi lại, không broadcast** — lệch nhẹ so với chữ "phát lại `movePayload`"
  trong TODO (không nói rõ gửi cho ai). Lý do ghi ở trên; nếu broadcast thì chính gap check của mục 5
  sẽ báo động giả.
- **Branch off `dev` chứ không off `main`** như `docs/instruction/B152-*.md` viết. Lý do: mục tracking
  `#152` mới chỉ tồn tại trên `dev` (commit `9c5439b`), `git show main:TODO.md | grep '#152'` không ra
  gì ⇒ đúng ngoại lệ "tracking-docs-only-on-dev" của skill `git-workflow` (tiền lệ
  `fix/auth-cache-control-no-store`). Code lỗi có trên cả hai nhánh, `main` sẽ nhận qua checkpoint
  merge `dev`→`main`.

### Hạn chế đã phát hiện, KHÔNG tự mở rộng phạm vi để sửa

Gap detection (mục 5) **không** phá được deadlock 2 người ở đúng kịch bản mà file TODO mô tả. Gap chỉ
phát hiện được khi có một `game:moved` **tiếp theo** tới nơi; với 2 người luân phiên nghiêm ngặt thì
gói tiếp theo đó **chính là** nước mà người đang kẹt đang chờ, nên không bao giờ tới. Đã xác minh
`TimerManager` tick **thuần server-side**, không có broadcast định kỳ nào (`grep game:timer` trong
`client/js/room-socket.js` không ra gì) để làm sự kiện đánh thức. Người kẹt vẫn chạy hết đồng hồ và
thua giờ — có chặn trên, nhưng không phải "tự phục hồi".

Mục 5 **vẫn có giá trị thật** cho mọi client nhận được broadcast sau đó: khán giả, và bất kỳ luồng
nào không luân phiên nghiêm ngặt — đã verify bằng Playwright trên khán giả. Phần còn thiếu đã ghi
thành mục mới trong `TODO.md`/`instruction.md` thay vì tự nới phạm vi, đúng rule "scope discipline".

## Summary output

**Unit test — 33 case mới, giữ lại toàn bộ:**
- `server/tests/game-move-ack-resync.test.js` — 16 case: ack ok/error (tham số hoá theo bảng quyết
  định 3 loại từ chối), thứ tự broadcast-trước-ack, `ack` undefined (client cũ) cả 2 nhánh, dedupe
  replay, dedupe sống sót qua nước chen giữa, `moveId` mới trùng ô vẫn `CELL_OCCUPIED`, không `moveId`
  thì không ghi map, `handleGameEnd` xoá map, `game:resync` 3 trường hợp.
- `client/tests/game-move-ack-retry-resync.test.js` — 17 case: `.timeout(5000)` + `moveId` trong
  payload, **retry dùng lại đúng `moveId` cũ**, 2 move khác nhau khác id, timeout lần 2 dừng + resync,
  ack ok im lặng, ack error không retry, timeout sau khi ván kết thúc thì bỏ, gap tuần tự/nhảy
  cóc/echo lùi, **resync không lặp vô hạn**, `game:init`/`game:swap2_state`/`game:undo_applied` reset
  baseline (tham số hoá), i18n `vi`+`en` khác nhau.

**Xác nhận test không rỗng** (bài học #131): stash toàn bộ 7 file sửa ra rồi chạy lại → **26/33 fail**.
7 case còn xanh là các case bảo vệ hành vi *sẵn có* (fallback `game:error` cho client cũ, áp delta tuần
tự, các đường reset baseline) — đúng như mong đợi.

**`npm test`: 1289/1289 pass, 66 suite.**

**Verify thật (Playwright, Chromium):** instance **cô lập** — copy `git ls-files` sang scratchpad,
`node_modules` symlink, `.env` riêng, **cổng 3199**, DB mới tinh dựng từ `schema.sql`. Không đụng
`server/db/gomoku.db` thật và không đụng server thật đang chạy (PID 26017) — đúng skill
`playwright-e2e-safety`. Spec mới `e2e/game-move-ack-resync.spec.ts`, giữ lại trong repo.

Mô phỏng mất gói bằng cách vá `Socket#packet` của socket.io-client trong trang — chạy **sau** khi
`emit()` đã cấp ack id và hẹn giờ timeout (`socket.js` `_registerAckCallback` rồi `this.packet`), nên
client rơi vào đúng trạng thái của một gói mất thật; vá `emit()` thì sẽ nuốt luôn cả timeout và không
mô phỏng được gì.

4 kịch bản, tất cả qua bằng click chuột thật trên canvas (không emit tay):
1. Nước đi bình thường vẫn chạy (không hồi quy).
2. **Rớt gói `game:move`** → retry tự đặt được quân, `moveCount` tăng đúng **1** (không double-apply),
   người chơi thấy thông báo "đang thử gửi lại".
3. **Rớt mọi gói `game:move`** → 2 lần timeout → thông báo + `game:resync`, bàn cờ khớp server, lượt
   vẫn đúng, **không đứng hình**; sau khi mạng hồi phục đi lại được ngay.
4. **Rớt broadcast `game:moved`** (trên khán giả) → gap detection kéo lại đủ cả nước bị lỡ, và
   **không** tự kích hoạt resync lần hai trên chính state đầy đủ nhận về.

Không có `pageerror` nào trong suốt lượt chạy.
