# Fix log entry — 2026-08-19 21:26

## Prompt

"Process #131" — sau khi phân tích 2 file HAR người dùng cung cấp và ghi #130/#131 vào tracking.

## Action

`client/js/socket-client.js`: thêm `timeout: 8000` vào object truyền cho `io({...})` (trước đó không
đặt, tức dùng mặc định 20 000 ms của socket.io-client), kèm comment giải thích số đo HAR làm căn cứ.
Đúng 1 dòng cấu hình; giữ nguyên `transports: ['websocket','polling']`, `tryAllTransports`, và toàn
bộ `reconnection*` theo `docs/instruction/B131-*.md`. Bump `?v=130`→`?v=131` trên 17 file
(`client/*.html` + `client/js/*.js`), grep xác nhận còn đúng 1 giá trị (185 lần xuất hiện), 2 file
mockup vẫn pin `?v=61`.

Test mới `client/tests/socket-client-connect-options.test.js` (8 case, jsdom): 2 case cho chính bản
sửa (`timeout === 8000`, và khoảng hợp lệ `> 2900` / `< 20000` để một lần retune sau này vẫn phải
nằm trong biên đã đo), 3 case chặn hồi quy những thứ bản sửa **không** được đụng (thứ tự transport
websocket-first + `tryAllTransports`, bộ `reconnection*`, `withCredentials`), 1 case bất biến
`timeout > reconnectionDelayMax`, và 2 case biên của nhánh auth (token pre-#68 còn sót trong
localStorage vẫn đi kèm; không có session thì redirect login và **không** mở socket nào).

## Decision

**Sửa một tuyên bố sai của chính mình:** file `docs/todo/B131-*.md` và `docs/instruction/B131-*.md`
viết lúc ghi tracking đều nói `client/js/` "không có hạ tầng test tự động". Sai — `client/tests/` đã
tồn tại với 9 file jsdom test chạy trong `npm test`. Đã sửa lại cả 2 file và viết test thật thay vì
bỏ qua. (Comment đầu `client/tests/tournament-match-leave-lock.test.js` cũng nói "no test runner"
— đúng ở thời điểm nó được viết, nay đã cũ.)

**Sửa một kết luận sai trước đó trong cùng phiên:** #130 (tunnel `cloudflared` flap) từng bị nghi là
nguyên nhân gốc; log `journalctl` bác bỏ (`Application error 0x0 (remote)` = edge đóng bình thường).
Nguyên nhân gốc thật là mất gói SYN ở chặng trình duyệt ↔ Cloudflare edge — **không sửa được bằng
code**. Mục này chỉ giảm thiệt hại, đã ghi rõ như vậy trong cả 2 file B131.

**Branching:** `TODO.md #131` không có trên `main` (`git show main:TODO.md | grep '#131'` rỗng) nên
theo ngoại lệ của `git-workflow` skill, `fix/socket-io-connect-timeout` cắt từ `dev` và merge lại
`dev`, không đụng `main`.

**Lưu ý về môi trường:** server thật (`node server/index.js`, PID 37274) serve trực tiếp từ
`client/` trong chính checkout này (`server/index.js`: `clientPath = path/join(__dirname,'..','client')`),
nên mọi sửa file client trong working tree là **live ngay** với người chơi — không có cách cô lập
bằng branch. Đã chọn cách bump `?v=` cùng lúc với sửa file để trạng thái phát ra luôn nhất quán,
và xác minh bằng `curl` rằng domain thật đang phục vụ đúng bộ `?v=131`.

## Summary output

**Unit test:** `npm test` 1193/1193 pass (58 suite; trước bản sửa là 1185/57). Đã kiểm chứng test
không rỗng: bỏ dòng `timeout: 8000` ra thì **4/8 case fail**, trong đó 3 case đúng trọng tâm bản
sửa; 4 case regression-guard vẫn pass như mong đợi.

**Xác minh trình duyệt thật (Playwright + Chromium), trên instance CÔ LẬP** — copy repo sang
scratchpad, `node_modules` symlink, DB tự tạo mới trong scratchpad, cổng 3111, `.env` riêng. Không
đụng `server/db/gomoku.db` thật, không restart server thật (người chơi đang online). Kiểm chứng sau
khi xong: 0 row guest test (`PaleHawk`/`NeonSlug`) trong DB thật, site thật vẫn 200.

- Luồng thật guest → `index.html` → tạo phòng → `room.html`: socket connected sau **839 ms**,
  `transport = "websocket"`, `io._timeout = 8000` (tức socket.io-client **thật sự nhận** option, chứ
  không chỉ có mặt trong source), `reconnectionDelayMax = 5000`, banner "Đang kết nối…" không kẹt,
  **0 console error**, 0 response ≥ 500.
- **Đường thất bại đã mô phỏng được** (`ctx.routeWebSocket` nuốt handshake, tái tạo đúng kiểu WS#1
  trong HAR: transport được chấp nhận nhưng gói OPEN của engine.io không bao giờ tới):

  | | Thời gian bỏ cuộc lần thử đầu |
  |---|---|
  | Không có bản sửa (mặc định 20 000 ms) | **20 120 ms** |
  | Có bản sửa (`timeout: 8000`) | **8 122 ms** |

  Cùng một setup, chỉ khác đúng 1 dòng ⇒ tiết kiệm **~12,0 giây** mỗi lần lần kết nối đầu chết.

**Không sửa** `SocketHandler.js`, `server/index.js`, `pingTimeout`/`pingInterval` — đúng phạm vi
"KHÔNG làm" trong `docs/instruction/B131-*.md`.
