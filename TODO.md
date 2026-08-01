# TODO

Quy ước: file này tách làm 2 phần.

- **Phần A — Không sửa được bằng code.** Cần công cụ ngoài, quyết định triển khai
  thật, phần cứng/hạ tầng, hoặc kiểm chứng mà agent không tự làm được trong repo.
- **Phần B — Sửa được bằng code, đang chờ làm.** Việc thật sự có thể implement
  trong repo này, liệt kê theo báo cáo nguồn, kèm giải pháp + đánh giá hiệu quả/an
  toàn + trạng thái unit test (theo rule "Bug-fix workflow" trong `CLAUDE.md`).

Khi có báo cáo mới, mục nào không sửa được bằng code → thêm vào Phần A; mục nào
sửa được → thêm vào Phần B, dưới một heading nguồn riêng (giữ nguyên theo report).

---

## Phần A — Không sửa được bằng code

### Nguồn: `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)

#### 1. TLS/HTTPS trước app (review 3.0) — Nghiêm trọng nếu đang chạy HTTP trần

- Cần: đặt reverse proxy có TLS (Caddy hoặc nginx) trước `node server/index.js`.
  Caddy rẻ nhất — tự xin/gia hạn Let's Encrypt.
- Kèm theo bắt buộc trong `server/index.js`: `app.set('trust proxy', <đúng số hop>);`
  — thiếu dòng này thì `express-rate-limit` gộp mọi người dùng vào chung IP của
  proxy, khoá nhầm người thật; set sai (quá rộng) thì `X-Forwarded-For` giả mạo
  được và bypass rate limit.
- Nếu dùng Caddy: block `handle /socket.io*` phải đặt **trước** catch-all.
- **Việc của bạn:** xác nhận cách deploy thật hiện tại — có proxy TLS đặt ngoài
  repo chưa (nginx/Caddy/Cloudflare)? Nếu có rồi thì mục này coi như xong, chỉ
  cần xác nhận `trust proxy` đã set đúng số hop.

#### 2. Xác nhận biến môi trường khi deploy thật

- `NODE_ENV` có được set khi chạy qua pm2/systemd/docker không? (fix #1 đã đổi
  guard `JWT_SECRET` thành throw ở mọi env trừ `test`, nên rủi ro cụ thể này đã
  giảm — nhưng vẫn cần xác nhận `JWT_SECRET` thật được cấp qua biến môi trường,
  không dùng giá trị mặc định trong code).

#### 3. `npm install` không chạy được trên Node 24 tại máy đánh giá

- Lỗi: `better-sqlite3`/`bcrypt` không có prebuilt binary cho Node v24.18.0 và
  máy thiếu Python/MSVC toolchain để build native module.
- Không phải lỗi của repo (`package.json` khai `node >=18` hợp lệ), nhưng nên
  quyết định: pin Node version trong CI (`.nvmrc`/`engines`), hoặc cài
  Python/build-essential trên máy dev/CI mới, hoặc cân nhắc thay
  `better-sqlite3`/`bcrypt` bằng bản pure-JS/WASM nếu muốn tránh vấn đề build
  vĩnh viễn.

#### 4. Kiểm chứng thật cho các mục "CHƯA ĐO ĐƯỢC" trong review

- **Half-open socket thật** (điện thoại mất sóng, không gói FIN) — mọi cách
  ngắt trên localhost tới server ngay lập tức nên không mô phỏng được; cần
  **2 máy thật + `iptables DROP`** để đo đúng khoảng "mù" (ước tính 45s
  pingTimeout + 60s grace ≈ 105s, nhưng đây là suy luận chưa kiểm chứng).
- ~~**Timing attack trên login** (review 3.6) — `bcrypt` không load được trên máy
  đánh giá nên chưa đo được chênh lệch thời gian phản hồi thật.~~
  **✅ ĐÃ ĐO XONG (2026-08-02)** — máy này chạy được `bcrypt`, đã đo bằng 2
  git worktree (trước fix `82c861e` vs sau fix), server thật, n=60 mẫu/ca,
  bỏ 10 mẫu warmup, limiter nới **chỉ trong bản đo** (không commit):
  - **Trước:** user không tồn tại 1.10ms vs sai mật khẩu 206.27ms — **188x**,
    2 phân phối không giao nhau, 1 request là phân biệt được. Chạy lại: 1.06 vs
    203.66ms (192x).
  - **Sau:** 206.99 vs 204.12ms (lệch −2.87ms); 3 lần chạy lại: +14.61, +1.83,
    −0.18ms — **lệch đổi dấu giữa các lần chạy** và nằm trong khoảng p10–p90 của
    chính từng ca, tức là nhiễu chứ không phải tín hiệu.
  - Lưu ý giữ lại: đo trên localhost, **không có jitter mạng** — đây là điều
    kiện thuận lợi nhất cho kẻ tấn công; deploy thật còn nhiễu hơn nhiều.
- **`room:updated` ở đúng 20 người** — bị rate limiter chặn khi đo (không mint
  quá 20 guest token/15 phút/IP). Muốn đo đúng mốc `MAX_USERS_PER_ROOM = 20`
  cần restart server giữa các đợt hoặc tạm nới rate limit trên môi trường test.

### Nguồn: kiểm chứng bản sửa (commit `3da53dd`, đo lại 2026-08-01)

#### 5. Mục 3.8 "vòng đời mật khẩu" — cần nội dung đầy đủ

Báo cáo kiểm chứng nhắc tới mục **3.8 vòng đời mật khẩu**, ghi rõ *"mục này thêm
vào review sau khi bản sửa đã bắt đầu"* — tức đây là phần bổ sung vào
`gomoku-vn-review(1).md` chưa từng đọc qua (bản đọc gốc chỉ có 3.8 = "Đã kiểm và
KHÔNG phải lỗi", nội dung khác). **Chưa đủ thông tin để xếp vào Phần A hay B** —
cần bạn cung cấp nội dung đầy đủ của mục 3.8 mới (rất có thể liên quan tới việc
review 3.0 đã nêu: đổi mật khẩu không vô hiệu hoá JWT cũ, không có cơ chế thu
hồi token) trước khi đánh giá được đây có sửa bằng code được không.

---

## Phần B — Sửa được bằng code, đang chờ làm

### Nguồn: `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)

Đã đối chiếu `docs/fix-log.md` — các mục sau **chưa** xuất hiện trong fix-log,
còn phải làm. Thứ tự đề xuất: rẻ/an toàn trước, đụng nhiều điểm gọi/cả client
sau cùng.

1. ~~**Restart-hang: thêm nhánh `else`** (review 5.1) — `SocketHandler.js:113-125`,
   emit `room:destroyed`/`room:left` khi `!existingRoom` thay vì im lặng.~~
   **✅ ĐÃ XONG** (2026-08-01, commit `b35614e`, merge `3fcb619`) — nhánh `else`
   emit `room:destroyed`; client `room-socket.js` đã có sẵn handler (toast +
   redirect về `index.html`), không phải sửa client. Test: thêm describe mới
   "connection with no surviving room (restart-hang)" (3 case) vào
   `SocketHandler.test.js`; `npm test` 148/148 xanh. Chi tiết: `docs/fix-log.md`.

   **Đính chính (2026-08-02, commit `5b3a9f5`, merge `8678d2e`):** bản đầu gây
   **regression** — nhánh `else` bắn `room:destroyed` cho *mọi* kết nối chưa ở
   phòng, mà trang room mở socket **trước** khi gửi `room:create`/`room:join`,
   nên tạo phòng xong bị đá về sảnh và phòng vừa tạo bị huỷ (rỗng). Đã sửa:
   chỉ bắn khi `socket.handshake.auth.reconnect` (client set cờ này từ
   `socket.io.on('reconnect_attempt')` trong `socket-client.js`). Bump
   `?v=27` → `?v=28`. Thêm 2 test regression; `npm test` 174/174 xanh. Đã kiểm
   bằng browser thật (Playwright): tạo phòng OK, và kịch bản restart server
   thật cho thấy client quay về sảnh (bản `0079f8f` thì treo vĩnh viễn).

2. ~~**Chat sanitize → escape entity** (review 3.5) — `ChatHandler.js:74`, đổi
   `replace(/<[^>]*>/g,'')` → escape `&lt;`/`&gt;`.~~
   **✅ ĐÃ XONG** (2026-08-01, commit `8fb3c4e`, merge `248ff36`) — `sanitize()`
   nay escape `<`/`>`; **cố ý không escape `&`** (client render bằng
   `textContent`, escape `&` sẽ làm hỏng chữ thường như "R&D", mà cũng không
   thêm an toàn gì). Test: file mới `ChatHandler.test.js`, 11 case gồm đúng
   chuỗi repro của review; `npm test` 159/159 xanh. Chi tiết: `docs/fix-log.md`.

3. ~~**`escapeAttr` sửa đúng cách escape** (review 3.7) — `lobby.js:474-476`,
   `room-ui.js:62-64`, đổi `\"`/`\'` → `&quot;`/`&#39;`.~~
   **✅ ĐÃ XONG** (2026-08-01, commit `d5c68ba`, merge `340812f`) — tách thành
   module thuần mới `client/js/escape-utils.js` (UMD, require được từ Node như
   `profanity-filter.js`), export `escapeAttr` (entity) + `escapeJsString`
   (backslash). **Lệch có chủ ý so với `instruction.md` §B3:** 2/4 call site là
   `onclick="joinRoom('…')"` — chuỗi JS lồng trong attribute HTML; chỉ escape
   entity ở đó sẽ **tạo lỗ mới** (parser giải mã `&#39;` thành `'` thật trước
   khi JS được parse), nên 2 site đó dùng `escapeAttr(escapeJsString(x))`.
   Đã bump `?v=26` → `?v=27` (45 chỗ). Test: file mới
   `server/tests/escape-utils.test.js`, 13 case; `npm test` 172/172 xanh.
   **Đã kiểm bằng browser thật** (Playwright, 2026-08-02): card sảnh khớp
   `.room-card[data-room-id="#MJ7"]`, `onclick` render đúng `joinRoom('#MJ7')`
   và bấm vào thì vào phòng thật; nút kick render đúng
   `kickUser('guest_40ab74a5')`. Chi tiết: `docs/fix-log.md`.

   *Đính chính:* jest `testMatch` thực tế là `**/tests/**/*.test.js` (không chỉ
   `server/tests/**`), nên test cho code client **không** cần đổi config.

4. ~~**`SELECT *` lộ player_id + thiếu rate limit `GET /api/games`** (review 6.4)~~
   **✅ ĐÃ XONG** (2026-08-02, commit `1b8c458`, merge `15fda80`) —
   `getGameById` chọn cột tường minh (bỏ `black_player_id`/`white_player_id`);
   thêm `gamesLimiter` (15 phút / 300 request) cho cả 2 route. Test: file mới
   `server/tests/games-route.test.js`, 6 case chạy SQL thật trên SQLite
   in-memory; `npm test` 180/180 xanh. Đã kiểm trên server thật (header
   `X-RateLimit-Limit: 300` ở cả 2 route). **2 điểm cần biết → mục 16 và 17
   bên dưới** (client *có* đọc 2 cột đó cho dữ liệu cũ; route list vẫn trả
   ids). Chi tiết: `docs/fix-log.md`.

5. ~~**Idle-scan magic number → config** (review 5.5) — `RoomManager.js:49-52`,
   rút `60000` thành hằng số trong `config.js`.~~
   **✅ ĐÃ XONG** (2026-08-02, commit `c468d16`, merge `2a622db`) — thêm
   `IDLE_SCAN_INTERVAL_MS = 60_000` vào `config.js` ngay dưới `IDLE_TIMEOUT_MS`;
   hành vi không đổi. TODO nói "không cần test riêng" nhưng vẫn viết theo rule
   `CLAUDE.md`: file mới `server/tests/RoomManager.test.js` (4 case, mock config
   bằng **sentinel** `12_345` — nếu assert theo giá trị thật 60_000 thì test vẫn
   xanh dù chưa sửa gì). Đã mutation-check: khôi phục literal thì 2/4 case đỏ.
   `npm test` 184/184 xanh. **File này là thứ mục 7 (room quota theo IP) cần —
   mục đó mở rộng file sẵn có, không phải tạo mới.** Chi tiết: `docs/fix-log.md`.

6. ~~**Timing attack — dummy bcrypt compare** (review 3.6) — `auth.js:135-143`,
   khi `!user` vẫn chạy `bcrypt.compare(password, DUMMY_HASH_CỐ_ĐỊNH)`.~~
   **✅ ĐÃ XONG** (2026-08-02, commit `985c9c4`, merge `2a842a1`) — thêm hằng
   `DUMMY_PASSWORD_HASH` (hardcode, cost 12 khớp `BCRYPT_ROUNDS`), bỏ
   early-return, đổi thành `if (!user || !match)`. Test: file mới
   `server/tests/auth-login-timing.test.js`, 9 case (đối xứng code path +
   2 guard ở mức source: hằng phải hardcode, cost phải khớp `BCRYPT_ROUNDS`);
   mutation-check: khôi phục early-return thì 3/9 đỏ. `npm test` 193/193 xanh.
   **Đã đo thời gian thật — xem Phần A #4, mục đó coi như đóng.**
   Chi tiết: `docs/fix-log.md`.

7. ~~**Room quota theo IP** (review 3.2) — `RoomManager.createRoom()`, đếm số
   phòng theo IP người tạo, chặn khi vượt ngưỡng (không phải 1).~~
   **✅ ĐÃ XONG** (2026-08-02, commit `3abe3a3`, merge `972f695`) — chọn hướng
   (a) của `instruction.md` §B7 (quota theo IP), không chọn (b) cấm guest tạo
   phòng. Thêm `MAX_ROOMS_PER_IP = 3`, room lưu `creatorIp`, `LobbyHandler`
   truyền `socket.handshake.address`. **Không dùng bộ đếm tăng/giảm** — đếm
   trực tiếp bằng cách quét `this.rooms` lúc tạo, nên **không có đường decrement
   nào để quên** (đúng rủi ro mà mục này cảnh báo): phòng bị huỷ là biến khỏi
   map, đếm lại là đúng. Test: mở rộng `RoomManager.test.js` 4 → 14 case (cover
   cả 3 đường huỷ + case xoá thẳng khỏi map + `creatorIp` không lộ ra client);
   mutation-check: bỏ khối quota thì 4/14 đỏ. `npm test` 203/203 xanh.
   **Đã kiểm bằng browser thật:** 3 phòng đầu tạo được, phòng thứ 4 bị từ chối
   kèm toast tiếng Việt, sau khi 1 phòng đóng thì tạo được tiếp.
   **Hạn chế đã biết (không thuộc phạm vi mục này):** sau reverse proxy thì mọi
   kết nối mang IP của proxy → gộp chung 1 quota; cần `trust proxy`, xem Phần A #1.
   Chi tiết: `docs/fix-log.md`.

8. ~~**Bỏ `settings` khỏi `room:updated`** (review 4.2) — chỉ gửi `settings`
   khi thực sự đổi.~~
   **✅ ĐÃ XONG** (2026-08-02, commit `09a6de1`, merge `3f01271`) — thêm
   `RoomManager.serializeRoomUpdate()` (= `serializeRoom` bỏ `settings`), đổi
   **đủ 17/17 điểm emit**, trừ đúng 1 điểm ở handler `room:settings` (chỗ duy
   nhất settings thật sự đổi). Client `room-socket.js` chuyển sang **merge**
   thay vì replace — **bắt buộc**, vì `room-ui.js:315` và `game-ui.js:62` đọc
   `roomData.settings` **không** optional-chain (đúng rủi ro mục này cảnh báo),
   replace là throw ngay update đầu tiên. Bump `?v=28` → `?v=29`.
   Test: `RoomManager.test.js` 14 → 20 case, trong đó có **quét source** đếm
   đủ 17 điểm emit và bắt buộc 16 dùng `serializeRoomUpdate` — đây mới là thứ
   chặn được rủi ro "sót 1 điểm"; mutation-check: đổi 1 điểm về `serializeRoom`
   thì test đỏ. `npm test` 209/209 xanh. **Đã kiểm browser thật** (6 guest
   trong 1 phòng): settings sống sót qua `room:updated`, đổi board size 17→19
   thì cả 2 phía cập nhật, 0 lỗi JS. **Đo thật:** 809B/bản × 6 người = 4854B
   mỗi hành động, so với 5898B trước — **giảm 17.7%**, càng đông càng lợi
   (≈3480B/hành động ở 20 người). Chưa làm phần delta "user X đổi slot"
   (`instruction.md` §B8 ghi rõ đây là bước tuỳ chọn). Chi tiết: `docs/fix-log.md`.

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

10. ~~**`timer:tick` → gửi `deadline` 1 lần/lượt** (review 4.3) — client tự
    đếm ngược.~~
    **✅ ĐÃ XONG** (2026-08-02, commit `30ff8b4`, merge `99a06cb`) —
    `TimerManager.getSync()` trả `{black, white, activeColor, deadline,
    serverTime, running}`; chỉ emit `timer:sync` ở các điểm **gãy** (bắt đầu
    ván, Swap2 xong, cộng giờ, pause khi mất kết nối, resume, payload vào lại
    phòng). Đổi lượt **đi ké trong `game:moved`** (`timerSync`) nên 1 nước vẫn
    đúng 1 gói. `onTick` thành no-op — interval vẫn chạy phía server để giữ
    đồng hồ chuẩn + bắt timeout. Client `room-socket.js` tự đếm 1s/lần từ
    deadline. Bump `?v=30` → `?v=31`.
    **Có gửi kèm `serverTime`** dù `instruction.md` §B10 nói reviewer không yêu
    cầu — client tính theo offset, không so đồng hồ máy mình với timestamp
    tuyệt đối, nên máy lệch giờ vẫn đếm đúng; giá 1 con số/gói.
    **Lệch so với dự đoán của TODO:** describe "start/tick" trong
    `TimerManager.test.js` **không cần viết lại** — `onTick` không đổi hành vi,
    chỉ là không còn nối vào socket, nên test cũ vẫn đúng; đã giữ nguyên và
    thêm 9 case mới (gồm 1 case replay đúng phép tính của client từng giây và
    2 guard mức source: không còn chỗ nào emit `timer:tick`). `npm test`
    232/232 xanh; mutation-check: bật lại emit mỗi giây thì 2 guard đỏ.
    **Đã kiểm browser thật** (2 khách chơi ván thật): 2 client hiện đồng hồ
    giống hệt nhau, **0 gói trong 6 giây không ai đi**, 0 lỗi JS.
    **Đo thật (1 client, cùng kịch bản):** trước 11 gói/521B → sau 2 gói/374B;
    quy ra 1 phút chơi ở nhịp 8 nước/phút: 3368B → 1960B (**giảm 41.8%**), còn
    lúc nhàn rỗi thì giảm **tuyệt đối** (0B thay vì 40B/giây).
    Chi tiết: `docs/fix-log.md`.

### Nguồn: kiểm chứng bản sửa (commit `3da53dd`, đo lại 2026-08-01)

Không thuộc review gốc — phát hiện mới từ đợt kiểm chứng, nhưng sửa được bằng
code và nên ưu tiên cao vì rẻ.

11. ~~**Viết test cố định cho 6 fix hiện không có gì bảo vệ**~~
    **✅ ĐÃ XONG** (2026-08-02, commit `cdd57b0`, merge `3634d63`) — khôi phục
    đủ 6, dựng lại đúng kịch bản ghi trong cột "Bằng chứng" của từng fix:
    file mới `flood-protection.test.js` (9 case, fix #7 — bắt middleware qua
    chính `io.use()` vì nó không export), file mới `save-game.test.js` (10 case,
    fix #2 + #3 — chạy schema thật + INSERT thật trên SQLite in-memory, FK ON),
    mở rộng `RoomManager.test.js` (+3, fix #6), `DisconnectHandler.test.js`
    (+3, fix #4), `lobby-delta.test.js` (+4, fix #12). `npm test` 261/261 xanh
    (+29 case). **Mutation matrix — gỡ từng fix một, chạy lại cả suite:**
    #2 → 1 đỏ, #3 → 1 đỏ, #4 → 2 đỏ, #6 → 1 đỏ, #7 → 2 đỏ, #12 → 1 đỏ.
    Trước đây cả 6 đều **không** bị bắt.
    **Lưu ý thu hẹp phạm vi cho #12:** sau khi có delta (mục 9), gỡ debounce
    **không còn đổi số gói** — flush thừa trên state không đổi thì diff ra rỗng
    và không gửi gì, nên mọi assert theo số gói đều xanh giả. Thứ debounce còn
    bảo đảm là **1 timer/burst thay vì 1 timer/lệnh gọi**, test assert đúng
    điều đó (`jest.getTimerCount()`). Chi tiết: `docs/fix-log.md`.

    ~~Mô tả gốc:~~ mutation test (gỡ
    từng fix khỏi 1 bản copy, chạy lại suite) cho thấy gỡ **bất kỳ cái nào** trong
    fix #2 (isGuest thật), #3 (`!noScore`), #4 (không resume khi đối thủ còn
    grace), #6 (chặn kick khi `interrupted`), #7 (flood: 1 warning/cửa sổ + ngắt
    khi tái phạm), #12 (debounce lobby) đều cho **145/145 xanh y hệt** — không
    test nào bắt được. `docs/fix-log.md` tự ghi nhận đã *"wrote and ran (then
    discarded)"* các test này cho từng fix lúc implement — tức test **đã viết
    rồi, chỉ cần khôi phục lại và giữ trong suite** thay vì viết mới từ đầu.
    **Đây là việc rẻ nhất, giá trị cao nhất trong toàn bộ TODO**: không cần thiết
    kế gì mới, chỉ cần lấy lại đúng test đã chạy qua một lần khi làm fix (xem mô
    tả từng fix trong `fix-log.md` để biết chính xác kịch bản test đã dùng) và
    thêm vào `server/tests/`. Khớp đúng rule "Bug-fix workflow" mới thêm vào
    `CLAUDE.md` — không xoá test sau khi viết.

12. **Thứ tự sai tiềm ẩn trong `cancelDisconnectGrace`** — `disconnectTimers.delete()`
    chạy ở dòng 174, **trước** khi kiểm tra membership ở dòng 181. Nếu nhánh đó
    từng chạy được, grace timer bị huỷ sớm và không còn gì kết thúc ván — phòng
    kẹt vĩnh viễn ở `interrupted` (mà `_idleCleanup` lại bỏ qua trạng thái này).
    **Hiện chưa khai thác được** vì fix #6 đã chặn kick khi `interrupted` — nên
    đây là latent bug, không phải lỗi đang mở, nhưng đáng sửa vì rẻ (đổi thứ tự
    2 khối code) và loại bỏ hẳn nguy cơ nếu sau này có đường khác dẫn tới nhánh
    đó. Sửa: dời `disconnectTimers.delete()` xuống sau các kiểm tra trong
    [DisconnectHandler.js](server/socket/handlers/DisconnectHandler.js). Test:
    thêm case vào `DisconnectHandler.test.js` dựng đúng kịch bản race (membership
    mất trước khi grace hết) để xác nhận ván kết thúc thay vì kẹt.

### Nguồn: kiểm chứng bằng browser thật (Playwright, 2026-08-02)

Phát hiện khi verify Phần B #1/#2/#3 trên Chromium. Không gộp vào các fix đó
(rule "scope discipline") — ghi riêng ở đây.

13. ~~**Chat hiển thị entity thô sau fix #2**~~ — server escape `<`/`>` thành
    `&lt;`/`&gt;`, nhưng client render bằng `textContent`, nên người dùng gõ
    `<b>bold</b>` thì **thấy đúng chuỗi `&lt;b&gt;bold&lt;/b&gt;`** trên màn
    hình (đã xác nhận bằng browser). `R&D & co` hiển thị đúng (vì cố ý không
    escape `&`), và không có injection nào (`0` thẻ `<img>` sống).
    **✅ ĐÃ QUYẾT ĐỊNH (2026-08-02, hỏi người dùng trực tiếp — xem hội thoại,
    không phải fix code):** giữ nguyên phương án (a) — escape tại server đúng
    chữ `instruction.md` §B2. Lý do chọn: payload trên dây luôn trơ (bất kỳ
    consumer tương lai nào — client khác, admin panel, log — đều an toàn mặc
    định kể cả nếu quên tự escape), rẻ hơn việc phải giữ đúng invariant
    "mọi nơi render đều dùng `textContent`" mãi mãi. Phần hiển thị sai
    (`&lt;b&gt;` thay vì `<b>` trên màn hình) được tách thành lỗi UI riêng —
    xem mục 15 — không lẫn vào quyết định an ninh này.

14. **`reconnect_attempt`/`reconnect` listener ở `socket-client.js` không bao
    giờ chạy** — [socket-client.js:57,61](client/js/socket-client.js#L57) gắn 2
    listener này lên **socket**, nhưng Socket.io v4 phát chúng ở **Manager**
    (`socket.io.on(...)`). Hệ quả: banner trạng thái không bao giờ hiện
    "đang kết nối lại". Phát hiện khi làm đính chính fix #1 (fix đó dùng đúng
    `socket.io.on('reconnect_attempt')` nên không bị ảnh hưởng). Rẻ: đổi 2 dòng
    sang `this.socket.io.on(...)`. Test: client-side; `escape-utils.js` đã tạo
    tiền lệ tách hàm thuần ra để test, nhưng phần này là wiring socket nên có
    thể cần e2e Playwright (repo giờ đã có Playwright) thay vì unit test.

15. **Chat hiển thị `&lt;`/`&gt;` thô thay vì `<`/`>`** — hệ quả UI của quyết
    định giữ nguyên fix #2 (xem mục 13): server escape entity đúng như thiết
    kế, nhưng `chat-ui.js` (4 chỗ dùng `textContent` — dòng 32, 43, 49, 78) gán
    thẳng `msg.text` chưa giải mã, nên người gõ `<b>bold</b>` thấy đúng chữ
    `&lt;b&gt;bold&lt;/b&gt;` trên màn hình thay vì chữ họ gõ. Sửa: decode
    entity (`&lt;`→`<`, `&gt;`→`>`) **ngay trước khi** gán `textContent` tại 4
    điểm đó — an toàn vì `textContent` không parse lại thành thẻ dù input là
    gì. Rẻ, không đụng phần server/an ninh của fix #2. Test: client-side, có
    thể tách hàm decode thuần ra module test được qua Node (theo tiền lệ
    `escape-utils.js`) hoặc test bằng Playwright.

### Nguồn: phát hiện khi làm Phần B #4 (2026-08-02)

16. **`GET /api/games` (route list) vẫn trả `black_player_id`/`white_player_id`**
    — `getRecentGames` trong [database.js:184-194](server/db/database.js#L184)
    liệt kê 2 cột này **tường minh** (không phải `SELECT *`), nên review 6.4 chỉ
    nhắc route `/:id`. Hệ quả: sau khi làm xong mục 4, cùng 2 id đó **vẫn** công
    khai cho mọi khách vãng lai qua route list — tức lỗ hổng thông tin chưa
    thực sự đóng. Sửa: bỏ 2 cột khỏi `getRecentGames`. **Ràng buộc:** phải làm
    cùng lúc với mục 17, vì `renderGameTable` → `getResultText` →
    `resolveWinnerName` đọc chính 2 cột này cho dữ liệu cũ trên màn hình danh
    sách. Test: thêm case vào `server/tests/games-route.test.js` (đã có sẵn hạ
    tầng in-memory).

17. **`resolveWinnerName` phụ thuộc `*_player_id` cho dữ liệu cũ** —
    [history.js:441-459](client/js/history.js#L441-L459) có 3 nhánh dự phòng
    đọc `black_player_id`/`white_player_id` (winner lưu dạng raw player id;
    suy luận theo loại trừ khi 1 ghế là khách). Sau mục 4, màn hình xem lại
    (`/api/games/:id`) không còn 2 cột đó nên các ván **cũ** rơi về nhãn chung
    "Có người thắng"/"Người chơi" thay vì tên. DB dev có 0 ván nên **chưa đo
    được ảnh hưởng thật** — cần kiểm trên DB production xem còn bao nhiêu hàng
    có `winner NOT IN ('BLACK','WHITE','draw')`. Nếu còn: sửa đúng cách là để
    **server** tự phân giải tên người thắng (thêm trường `winner_name` vào
    response) rồi bỏ hẳn 3 nhánh legacy ở client — khi đó mục 16 cũng làm được
    an toàn. Nếu không còn hàng nào: xoá 3 nhánh legacy là đủ.

---

<!-- Khi nhận báo cáo mới: thêm heading "### Nguồn: <tên báo cáo>" dưới đúng
     Phần A hoặc Phần B, giữ định dạng số thứ tự + đánh giá hiệu quả/an toàn +
     trạng thái test như trên. -->
