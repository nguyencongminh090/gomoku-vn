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

> **Cập nhật 2026-08-02 (commit `9bfa1be`):** phần **chạy local** đã xử lý xong —
> `server/config.js` tự đọc `.env` (qua `server/utils/load-env.js`), và
> `./start.sh` tự sinh secret ngẫu nhiên vào `.env` ở lần chạy đầu. Biến môi
> trường thật **luôn thắng** file, loader **không chạy** khi `NODE_ENV=test`.
> Phần còn lại của mục này vẫn là **việc của bạn**: xác nhận `JWT_SECRET` trên
> máy chủ thật được cấp qua biến môi trường của pm2/systemd/docker, **không**
> dựa vào file `.env` nằm cạnh code.

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

### Nguồn: stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)

#### 6. Quyết định kiến trúc khi cần scale quá 1 tiến trình

- Toàn bộ state sống trong RAM của đúng 1 tiến trình: `RoomManager.rooms` (Map),
  và trong `server/socket/state.js` là `sessions`/`timerMap`/`disconnectTimers`/
  `readyTimers`. Không có clustering, không có worker_threads, không có adapter.
- Muốn chạy nhiều instance (hoặc `cluster`) thì **bắt buộc** kèm: sticky session
  ở tầng proxy + `@socket.io/redis-adapter` (hoặc tương đương) + đưa state phòng
  ra ngoài RAM tiến trình. Đây là quyết định hạ tầng + phụ thuộc mới, không phải
  sửa trong repo.
- **Đo được (2026-08-02): CPU chỉ ~12% của MỘT core ở 2000 người chơi đồng thời**,
  RSS ~200MB. Tức là **chưa** chạm trần 1 core — đừng làm việc này vì lý do hiệu
  năng ở thời điểm hiện tại. Chỉ làm khi có nhu cầu HA/không được downtime, hoặc
  khi đo lại thật sự thấy 1 core bão hoà.
- Ràng buộc kèm theo nếu làm: mất tiến trình = mất toàn bộ ván đang chơi (không
  có persistence cho state phòng), nên đây cũng là câu hỏi "chấp nhận mất ván khi
  restart hay không", không chỉ là câu hỏi throughput.

#### 7. ~~Đo lại bằng harness đa tiến trình (hoặc máy thứ 2)~~

**✅ ĐÃ ĐO (2026-08-02)** — dùng `scripts/capacity-test/` (B26, xem mục 26)
với server phụ raised-cap ở cổng 3099 (đã tắt sau khi xong; server thật ở 3000
không đụng tới):

- Bắt được 1 bug thật trong chính harness trước khi tin số liệu: `worker.js`
  ban đầu chạy các phòng được giao cho 1 worker **tuần tự**, nên
  `--workers=8` chỉ tạo ra ~8 phòng đồng thời thật bất kể `--rooms` là bao
  nhiêu — đúng loại lỗi mục này lo ngại. Đã sửa thành `Promise.all` toàn bộ
  phòng của 1 worker, xác nhận bằng thời gian chạy giảm đúng tỉ lệ (150 phòng:
  100s tuần tự → 6.9s song song thật).
- Sau khi sửa: 100-400 người sạch, CPU 3-4%/1 core. **2000 người đồng thời**
  (đúng con số nghi ngờ trong báo cáo cũ): **0 lỗi**, p95=75ms, p99=135ms,
  **CPU ~37%/1 core** (số cũ 12% là giả tạo do chính harness đơn tiến trình
  nghẽn). **3000 người**: vẫn sạch 100%, CPU ~31%, RSS ~273MB. **3200 người**:
  bắt đầu lác đác lỗi (6/1600 phòng). **3500+ người**: lỗi rõ (13-18%), log
  server có `Session ID unknown` — bắt tay long-polling Engine.io va chạm khi
  hàng nghìn kết nối MỚI nổ cùng lúc.
- **Điểm gãy không phải CPU/RAM** — CPU đỉnh chỉ ~41%/1 core, RSS ~271MB ngay
  tại điểm bắt đầu lỗi. Nút thắt nằm ở bước bắt tay kết nối dưới burst cực
  đoan, không phải logic ván đấu/bộ nhớ.
- Vẫn còn giới hạn: đây là burst nhân tạo (toàn bộ N người connect cùng lúc
  qua `Promise.all`), traffic thật rải rác theo thời gian sẽ nhẹ hơn nhiều ở
  bước này — số liệu vẫn là "sàn bi quan", không phải trần thực tế.
- **Con số có thể trích dẫn**: server chịu được **~3000 người chơi đồng thời
  sạch**, bắt đầu suy giảm ở **~3200-3500+**, do bắt tay kết nối chứ không
  phải CPU/RAM. Chi tiết: `docs/stress-test-report.md` §9,
  `instruction.md` §A7.

#### 8. Chưa có cách quan sát heap/GC của server đang chạy

- Đợt đo chỉ lấy được RSS qua `ps` từ ngoài. Không thấy heap used/limit, không
  thấy GC pause — mà đúng lúc p95/p99 vọt lên (94–143ms ở 2000 người) thì GC là
  một nghi phạm hợp lý không kiểm chứng được bằng RSS.
- Cần quyết định cách lấy: chạy server với `--inspect` rồi lấy profile, hoặc thêm
  endpoint debug **chỉ bật ngoài production** trả `process.memoryUsage()`, hoặc
  gắn APM. Là quyết định vận hành nên xếp Phần A; phần code của nó (nếu chọn
  hướng endpoint) thì nhỏ.

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

12. ~~**Thứ tự sai tiềm ẩn trong `cancelDisconnectGrace`**~~
    **✅ ĐÃ XONG** (2026-08-02, commit `b7ee25a`, merge `5145b79`) — dời 3 dòng
    teardown (`clearTimeout`/`clearInterval`/`delete`) xuống **sau** cả 2 guard,
    nên nhánh bail-out để nguyên grace timer đang chạy, ván vẫn kết thúc được
    thay vì phòng kẹt `interrupted` vĩnh viễn.
    **Ràng buộc thứ 2 mà mục này chưa nêu:** teardown phải nằm **trên** vòng
    quét `otherStillAway` — nếu để xuống dưới, chính entry của người vừa vào
    lại sẽ bị đếm là "đối thủ còn trong grace" và **không ván nào resume được**
    (đây mới là lỗi thật, không còn latent). Đã ghi rõ cả 2 ranh giới trong
    comment tại chỗ và pin bằng test.
    Test: +3 case trong `DisconnectHandler.test.js`; `npm test` 264/264 xanh.
    **Mutation-check 2 chiều:** trả lại thứ tự cũ → 2 case mới đỏ; dời teardown
    xuống dưới `otherStillAway` → 4 case đỏ (gồm 3 case resume có sẵn).
    Chi tiết: `docs/fix-log.md`.

    ~~Mô tả gốc:~~ `disconnectTimers.delete()`
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

14. ~~**`reconnect_attempt`/`reconnect` listener ở `socket-client.js` không bao
    giờ chạy**~~
    **✅ ĐÃ XONG** (2026-08-02, commit `c149bc4`, merge `d32a149`) — chuyển cả 2 listener sang
    `this.socket.io.on(...)` (Manager), gộp phần cập nhật banner và phần set cờ
    `reconnect` trong auth payload vào chung 1 handler `reconnect_attempt` (2
    listener cũ cho cùng 1 event, 1 cái chết 1 cái sống — nay chỉ còn 1). Bump
    `?v=32` → `?v=33`. Test: file mới `e2e/reconnect-banner.spec.ts`
    (Playwright) — `context.setOffline(true)` trên browser thật + server thật,
    assert banner đi từ "Mất kết nối..." sang "Kết nối lại... (lần N)" rồi tắt
    khi online lại. **Đã chạy test này trên bản lỗi trước khi sửa** — đỏ đúng
    như dự đoán (banner kẹt ở "Mất kết nối..."), sau đó xanh khi khôi phục fix.
    **Tiện thể sửa luôn 1 lỗi có sẵn không liên quan** mà test này lộ ra:
    `playwright.config.ts` chưa set `baseURL`, nên mọi e2e test dùng
    `page.goto()` tương đối — kể cả `e2e/homepage.spec.ts` đã commit trước đó —
    đều lỗi "Cannot navigate to invalid URL"; đã set `http://localhost:3000`
    (override được qua `PLAYWRIGHT_BASE_URL`). Chi tiết: `docs/fix-log.md`.

15. ~~**Chat hiển thị `&lt;`/`&gt;` thô thay vì `<`/`>`**~~
    **✅ ĐÃ XONG** (2026-08-02, commit `fed57d1`, merge `4d4d3e1`) — thêm
    `decodeChatText()` vào `client/js/escape-utils.js` (chỉ đảo `&lt;`/`&gt;`),
    áp tại 2 chỗ render text người dùng trong `chat-ui.js` (bong bóng chat +
    float message trong ván). **Không phải lỗ hổng:** `textContent` không parse
    markup, payload trên dây **vẫn escape** (giữ đúng quyết định mục 13), và
    **không** đảo `&amp;` vì server không bao giờ sinh ra nó. 2 nhánh system
    message giữ nguyên — chuỗi đó do server tự viết, chưa từng qua `sanitize()`.
    Bump `?v=31` → `?v=32`. Test: +6 case trong `escape-utils.test.js`, assert
    **round-trip với `ChatHandler.sanitize()` thật** nên 2 nửa không thể lệch
    nhau; `npm test` 280/280 xanh. **Đã kiểm browser thật:** người đọc thấy
    đúng `<b>bold</b>`, `<img src=x onerror=alert(1)`, `R&D & co`, `xin chào`,
    0 thẻ sống trong log chat; bắt luôn frame WebSocket để thấy cả 2 nửa:
    trên dây `"text":"&lt;b&gt;bold&lt;/b&gt;"`, trên màn hình `<b>bold</b>`.
    Chi tiết: `docs/fix-log.md`.

    ~~Mô tả gốc:~~ **Chat hiển thị `&lt;`/`&gt;` thô thay vì `<`/`>`** — hệ quả UI của quyết
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

16. ~~**`GET /api/games` (route list) vẫn trả `black_player_id`/`white_player_id`**~~
    **✅ ĐÃ XONG** (2026-08-02, commit `3664314`, merge `5e7fd79`, làm cùng mục 17) — bỏ 2 cột
    khỏi response của cả `getRecentGames` (list) lẫn `getGameById` (`:id`).
    **Không dừng ở việc bỏ cột:** dữ liệu cũ (trước khi `saveGame` chuẩn hoá
    `winner` thành màu ghế) lưu `winner` = chính raw player id — nếu chỉ bỏ 2
    cột `*_player_id` mà giữ nguyên `winner`, id vẫn lộ qua trường khác. Nay
    `winner` cũng được chuẩn hoá về `'BLACK'`/`'WHITE'`/`'draw'`/`null` trước
    khi trả về (xem mục 17). Chi tiết: `docs/fix-log.md`.

17. ~~**`resolveWinnerName` phụ thuộc `*_player_id` cho dữ liệu cũ**~~
    **✅ ĐÃ XONG** (2026-08-02, commit `3664314`, merge `5e7fd79`) — không đợi kiểm được số hàng
    production (DB dev có 0 ván, không đo được), chọn thẳng hướng "đúng" mà
    mục này đã đề xuất sẵn cho trường hợp còn hàng cũ: server tự phân giải.
    Thêm `resolveWinnerSeat()` + `withWinnerName()` trong `database.js`, lặp
    lại đúng chuỗi fallback mà `history.js` từng chạy ở client (seat có sẵn →
    khớp raw id → khớp raw tên → loại trừ theo ghế khách), gắn `winner_name`
    vào mọi row trả về từ cả 2 route. Xoá hẳn `resolveWinnerName()` phía client
    (19 dòng) — 2 nơi gọi nay chỉ đọc `g.winner_name`. Bump `?v=33` → `?v=34`.
    Test: 2 fixture mới mô phỏng đúng hình dạng dữ liệu cũ thật (raw id +
    guest loại trừ) trong `server/tests/games-route.test.js`, 4 case mới;
    `npm test` 284/284 xanh. **Đã kiểm bằng browser thật:** chèn 1 ván thật qua
    đúng `saveGame()`, mở `history.html` trên server thật (port riêng, không
    đụng server :3000 đang chạy), xác nhận cả bảng danh sách lẫn màn xem lại
    hiện đúng tên người thắng; xoá ván test sau khi kiểm xong. Chi tiết:
    `docs/fix-log.md`.

### Nguồn: báo cáo người dùng khi test thủ công, tái hiện bằng Playwright (2026-08-02)

18. ~~**Tạo phòng bị từ chối do quota IP (mục 7) vẫn "flash" sang `room.html`
    rồi mới đá về lobby, dễ gây cảm giác "bấm Tạo phòng → bị đá về sảnh
    chính"**~~
    **✅ ĐÃ SỬA (2026-08-02)** — không phải lỗi ở quota theo IP (mục 7), quota
    hoạt động đúng thiết kế; vấn đề nằm ở trải nghiệm điều hướng lạc quan phía
    client khi request bị từ chối.
    - **Thử 2 hướng, chọn hướng an toàn hơn sau khi hướng đầu lộ ra lỗi thật:**
      hướng 1 (`submitCreate()` emit `room:create` từ chính trang lobby, chờ
      ack rồi mới điều hướng) đã **implement xong nhưng bị revert** — nó đòi
      hỏi ngắt socket của lobby trước khi socket mới của `room.html` kết nối
      lại, và dưới tải song song thật (nhiều Playwright worker cùng lúc trên
      máy dev) đã đo được khoảng cách ngắt→kết-nối-lại **vượt quá 5s, rồi vượt
      luôn cả 15s** — nghĩa là **bất kỳ** grace period hữu hạn nào cũng có thể
      bị phá vỡ bởi mạng/thiết bị chậm thật, không chỉ máy test. Rủi ro thật:
      phòng vừa tạo tự huỷ ngay dưới mắt người dùng thật trên kết nối chậm.
    - **Hướng 2 (đã chọn, đang dùng):** giữ nguyên kiến trúc điều hướng lạc
      quan cũ (`submitCreate()` vẫn điều hướng sang `room.html` ngay, `room:create`
      vẫn emit từ `processRoomIntent()` sau khi trang mới kết nối — không đổi gì
      ở server, không thêm cơ chế grace mới nào) — chỉ sửa phần **hiển thị**:
      thêm `#room-entry-overlay` (`client/room.html`) hiện mặc định (không cần
      JS bật) che toàn bộ khung phòng trống/chưa init cho tới khi `room:joined`
      thật sự tới (`room-socket.js` `hideEntryOverlay()`). Nếu bị từ chối,
      overlay vẫn che, toast lỗi hiện đè lên (z-index 1200 > 1100), rồi về lại
      `index.html` sau ~1.5s — đúng pattern đã dùng sẵn cho `room:kicked`/
      `room:destroyed`. Không còn thấy UI phòng trống/vỡ, không có cơ chế
      server mới nào để có thể lỗi tinh vi hơn.
    - Kịch bản thực tế dễ đụng ngưỡng 3: người chơi rời phòng nhưng đối thủ
      còn ở lại (`leaveRoom()` chỉ huỷ phòng khi rỗng hoàn toàn) — lặp lại vài
      lần, phòng cũ vẫn "sống" và cộng dồn vào quota của người tạo.
    - **Đã kiểm:** danh sách phòng ở lobby vẫn hiển thị đúng sau khi bị đá về
      — phần "danh sách phòng không load" trong báo cáo gốc **chưa tái hiện
      được**, có thể do độ trễ cảm nhận (1.5s + round-trip subscribe) chứ
      không phải lỗi thật; cần thêm chi tiết cụ thể hơn từ người báo cáo nếu
      vẫn gặp lại.
    - **Test:** `e2e/leave-then-create-room.spec.ts` cập nhật lại theo hành vi
      cuối cùng — assert overlay hiện ngay khi vừa sang `room.html`, toast lỗi
      xuất hiện, rồi bounce về lobby. Chạy PASS ổn định kể cả dưới tải song
      song nặng (`--workers=6`, cùng 3 file spec chạy chung — đúng điều kiện
      từng làm lộ ra lỗi của hướng 1). `npm test`: 289/289 xanh (không đổi số
      lượng test unit vì #18 không cần code phía server).
    - **⚠️ Vòng 2 (2026-08-02, sau khi test thật trên `play3cr.dpdns.org`):**
      người dùng báo cáo **không tạo được phòng nào cả** — log server cho
      thấy `Room #XYT created` → `Disconnected` → `Room #XYT destroyed
      (empty)` gần như cùng giây, lặp lại liên tục cho mỗi lần bấm Tạo phòng.
      Hướng 2 ở trên chỉ sửa phần **hiển thị** (che UI vỡ bằng overlay) chứ
      **không sửa nguyên nhân gốc**: `DisconnectHandler.handleDisconnect()`
      huỷ phòng ngay lập tức khi người dùng còn lại (0 người) — kể cả khi
      chính là do socket vừa ngắt để chuyển trang / kết nối lại chưa kịp, chứ
      không phải bỏ phòng thật. Trên localhost khoảng ngắt→nối lại đủ nhanh để
      không lộ; qua mạng thật (không phải do proxy — người dùng xác nhận vẫn
      là do transition lobby → room bị server xử lý như ngắt kết nối thật) nó
      lộ ra ở **mọi lần**, không chỉ dưới tải nặng giả lập.
      - **Sửa thật lần này:** thêm `EMPTY_ROOM_GRACE_MS` (`server/config.js`,
        mặc định 20s, override qua env) — khi người dùng ngắt kết nối và là
        thành viên duy nhất còn lại trong phòng (không phải do bấm nút "Rời
        phòng" — `room:leave` trong `RoomHandler.js` vẫn huỷ ngay lập tức,
        không đổi), `DisconnectHandler.js` không huỷ phòng ngay mà chờ tối đa
        20s (`startEmptyRoomGrace`/`cancelEmptyRoomGrace`,
        `emptyRoomGraceTimers` trong `state.js`). Nếu cùng userId kết nối lại
        trong lúc chờ, `SocketHandler.js` huỷ timer trước khi chạy logic
        auto-rejoin sẵn có (`getRoomByUser`) — phòng vẫn còn, người dùng được
        đưa thẳng vào phòng như bình thường, không cần đổi gì phía client.
      - Đây là cùng ý tưởng với lần thử đầu (grace period) đã bị revert, khác
        ở chỗ: (1) **không** đổi client sang chờ ack trước khi điều hướng —
        kiến trúc điều hướng lạc quan giữ nguyên, nên không tạo thêm cửa sổ
        rủi ro nào mới so với hiện trạng; (2) grace chỉ áp dụng cho đường
        disconnect ngoài ý muốn, tách biệt hoàn toàn khỏi đường `room:leave`
        chủ động; (3) lần trước bị revert vì lo "bất kỳ timeout hữu hạn nào
        cũng có thể bị phá vỡ" — đúng về mặt lý thuyết, nhưng giờ đã biết rõ
        **hiện trạng không-có-grace mới là thứ luôn hỏng** (100% các lần thử
        tạo phòng thật, không phải lỗi hiếm dưới tải), nên grace hữu hạn là
        cải thiện chắc chắn chứ không phải rủi ro thêm vào một đường vốn đã
        chạy tốt.
      - **Test:** `server/tests/DisconnectHandler.test.js` — thêm describe
        block "empty-room grace period" (5 test: bắt đầu grace thay vì huỷ
        ngay, cancel qua reconnect thì không gọi `leaveRoom`, hết hạn thì huỷ
        thật, disconnect lặp lại không chồng timer, cancel khi không có gì
        đang chờ trả về `false`). Mutation-check: revert riêng
        `DisconnectHandler.js` → cả 5 test fail đúng như kỳ vọng → khôi phục →
        `npm test`: 294/294 xanh.

### Nguồn: stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)

Tất cả các mục dưới đây là **nghi vấn/rủi ro tiềm ẩn phát hiện khi đo tải, chưa
mục nào được xác nhận là bug đang mở**. Đợt đo chứng minh được điều ngược lại:
tới 2000 người chơi đồng thời (1000 ván) **không crash, không treo, không rò rỉ
bộ nhớ**, CPU ~12% một core, RSS ~200MB. Vì vậy **đừng "sửa" mục nào ở đây trước
khi tái hiện được vấn đề** — thứ tự đúng là đo/chẩn đoán trước, sửa sau.

19. ~~**`game:init` không tới trong 15s ở tải cao — chưa xác định được nguyên nhân**~~
    **✅ ĐÃ ĐO (2026-08-02)** — tách riêng chuỗi bắt tay (không kèm nước đi nào)
    thành 2 đoạn đo từ phía client: A = `room:sit` phát ra → xác nhận cả 2 đã
    ngồi (`room:updated`); C = `room:ready` phát ra → nhận `game:init`. Chạy
    2000 người (1000 cặp) đồng thời, **chỉ riêng bắt tay, không có nước đi nào
    cả**: **0 lỗi**, độ trễ tối đa toàn bộ chuỗi chỉ **122ms** — thấp hơn nhiều
    so với cửa sổ chờ 15 000ms từng gây lỗi trước đó.
    Chạy lại đúng script gốc (có kèm 6 nước đi/cặp, giống bản đo ban đầu) trên
    cùng server vừa khởi động lại: vẫn ra lỗi (6.7% lần này), nhưng **giai đoạn
    bị timeout khác lần trước** — lần này là `room:joined` (bước đầu tiên), lần
    trước là `game:init` (bước cuối). **Giai đoạn lỗi đổi giữa các lần chạy →
    không phải lỗi/race cố định ở một khâu cụ thể trong `room:sit` →
    `syncReadyWindow` → `room:ready` → `startGame`** (loại được giả thuyết (c)).
    **Kết luận: bản thân chuỗi bắt tay của server rất nhanh (≤122ms ở 2000
    người khi đo riêng); độ trễ/lỗi quan sát được trước đây đến từ việc cộng
    dồn lưu lượng nước đi chạy song song trong CHÍNH harness đo (giả thuyết
    (a)/(b)), không phải một lỗi cụ thể trong code bắt tay.** Không cần sửa gì
    ở `room:sit`/`syncReadyWindow`/`room:ready`/`startGame`. Vẫn giữ nguyên đề
    xuất ở Phần A #7 (harness đa tiến trình) nếu muốn đo tiếp con số chính xác.

20. ~~**p95/p99 độ trễ nước đi vọt lên dưới tải**~~
    **✅ ĐÃ ĐO PHẦN GC (2026-08-02), LOẠI ĐƯỢC GC** — chạy lại server với cờ
    `--trace-gc` (chỉ là flag chẩn đoán, không đổi code), lặp lại đúng kịch bản
    2000 người gây p95/p99 cao trước đó, rồi đối chiếu log GC với đúng khung
    giờ burst chạy (11-30 giây sau khi server khởi động). Trong khung đó: 66
    lần GC (đều là Scavenge trẻ + 1 Mark-Compact), **pause dài nhất chỉ
    3.92ms**, tổng cộng dồn **98.26ms GC trong suốt 19 giây burst**. 2 lần
    Mark-Compact "nặng" hơn (10-12ms) trong log đều xảy ra **sau khi burst đã
    xong** (dọn rác sau khi client đóng kết nối hàng loạt), không trùng khung
    giờ đo latency.
    **Kết luận: GC không giải thích được đuôi 70-143ms đã quan sát** — pause
    GC lớn nhất trong khung đo chưa tới 4ms. Đuôi latency nhiều khả năng vẫn là
    hệ quả của cùng nguyên nhân đã nêu ở mục 19 (cộng dồn lưu lượng trong
    harness), không phải GC. **Chưa đo được phần "chi phí fan-out" (mục 22) và
    "burst harness" tách biệt hoàn toàn khỏi GC** — 2 khả năng còn lại đã có dữ
    liệu ở mục 22 và Phần A #7 tương ứng.

21. ~~**Số timer chạy song song tăng tuyến tính theo số phòng**~~
    **✅ ĐÃ ĐO (2026-08-02), CHI PHÍ KHÔNG ĐÁNG KỂ** — dựng 784 ván thật đang
    sống song song (784 interval 1s của `TimerManager`, `timerMode: per_move`
    nên interval phải làm việc thật mỗi tick, không phải nhàn rỗi), rồi để
    **hoàn toàn im lặng** (không nước đi, không traffic gì) trong 12 giây, đo
    CPU server mỗi giây. **CPU giữ nguyên ~7.0-7.2% suốt 12 giây** — chỉ cao
    hơn baseline lúc chưa dựng ván (~5.7%) đúng 1.3-1.5 điểm phần trăm, cho
    784 timer cùng chạy. **Kết luận: chi phí interval-mỗi-phòng không đáng kể
    ở quy mô đã đo (tới ~800 phòng).** Không cần gộp về 1 interval chung —
    hướng đó (đã nêu trong mô tả gốc) **không nên làm** vì chưa có bằng chứng
    cần, đúng tinh thần "đừng sửa khi chưa đo được là nó đắt".

22. ~~**Chi phí fan-out của broadcast theo số người trong phòng**~~
    **✅ ĐÃ ĐO (2026-08-02)** — so sánh 2 cách chia **cùng 1000 kết nối**: (a)
    500 phòng × 2 người (0 khán giả) vs (b) 50 phòng × 20 người (2 người chơi +
    18 khán giả, đúng `MAX_USERS_PER_ROOM`).
    - **Trong 1 phòng đã ổn định (đang trao đổi nước đi), độ trễ người chơi
      chính và độ trễ khán giả nhận được gần như giống hệt nhau** (p50=1-2ms cả
      2 phía) — `io.to(roomId).emit()` là 1 lệnh đồng bộ quét hết thành viên
      trong cùng 1 tick, không có độ trễ tăng dần theo từng người nhận ở quy mô
      20 người/phòng.
    - **Nhưng đuôi p95/p99 của kịch bản (b) lại CAO HƨN kịch bản (a) rõ rệt**
      (70/122ms so với 19/24ms) dù (b) có ÍT phòng hơn hẳn (50 so với 500, tức
      ít lệnh `room:create` hơn). Nguyên nhân khoanh vùng được: mỗi phòng ở
      kịch bản (b) có 18 khán giả **join gần như cùng lúc** (`Promise.all`) sau
      khi phòng tạo xong — mỗi lần `room:join` lại phát `room:updated` tới
      **toàn bộ thành viên hiện có**, nên chi phí broadcast trong riêng giai
      đoạn LẤP ĐẦY phòng tăng theo kiểu bậc hai với số người (~1+2+...+19 lần
      gửi mỗi phòng chỉ tính riêng phần join), không phải tuyến tính. Độ trễ đo
      được ở vài nước đi đầu có thể là dư âm của đợt dồn này chưa kịp giải toả.
    **Kết luận: fan-out KHÔNG phải vấn đề ở giai đoạn ổn định (mỗi nước đi khi
    phòng đã đầy), NHƯNG có chi phí thật ở giai đoạn nhiều khán giả cùng ập vào
    1 phòng trong thời gian ngắn.** Nếu muốn tối ưu, hướng đúng là gộp/giảm số
    lần broadcast `room:updated` khi nhiều người join dồn dập (vd. debounce
    ngắn ở phase join, tương tự cách đã làm cho `lobby:update` ở TODO #9) —
    nhưng **chưa đủ bằng chứng để coi đây là ưu tiên sửa ngay**, vì kịch bản
    "18 khán giả join cùng lúc trong <1s vào 1 phòng" hiếm khi xảy ra thật
    ngoài môi trường test tải.

23. ~~**`better-sqlite3` đồng bộ + `bcrypt` chặn event loop**~~
    **✅ ĐÃ ĐO (2026-08-02)** — chạy 100 ván thật song song (200 người chơi, nhịp
    nước 500ms/nước) liên tục, giữa chừng bắn 14 lệnh `POST /api/auth/register`
    **thật** đồng thời (không bypass). Đo độ trễ nước đi ở 3 khoảng: trước/trong/
    sau đợt đăng ký. **Kết quả: độ trễ nước đi KHÔNG đổi** — p50=1ms cả 3 khoảng,
    p95/p99/max đều ở mức single-digit ms suốt, kể cả đúng lúc đợt đăng ký đang
    chạy (186 mẫu trong cửa sổ ~921ms của đợt bắn). **Giả thuyết ban đầu — "chặn
    toàn bộ ván đang chơi" — SAI ở quy mô đã đo.** Lý do: `bcrypt.hash()` dùng
    bản Promise (không có callback) → chạy trên libuv threadpool, **không** chặn
    main thread; phần đồng bộ thật sự (2 câu SQLite: check trùng tên + insert)
    đủ nhanh (DB nhỏ, có index) để không lộ ra ở độ trễ nước đi tại quy mô này.
    Bản thân request đăng ký thì chậm thật (p50=517ms, max=913ms cho 14 request
    đồng thời — hợp lý vì threadpool mặc định chỉ có 4 luồng, 14 request tranh
    nhau) — nhưng độ chậm đó **không lan sang** người đang chơi.
    **Giới hạn của phép đo này — đừng coi đây là đóng hẳn:** chỉ 14 request đăng
    ký cùng lúc (bị `authLimiter` 20/15 phút chặn bớt, không bắn được nhiều hơn),
    DB gần như rỗng (không đại diện DB đã có hàng nghìn user), và cửa sổ "trong
    đợt bắn" chỉ ~921ms nên số mẫu ít (186). Nếu sau này thấy nghi ngờ tương tự
    ở DB lớn hoặc burst đăng ký lớn hơn nhiều, nên đo lại chứ đừng dựa vào kết
    quả này mãi mãi. Harness: xem `docs/stress-test-report.md` (đoạn bổ sung).

24. ~~**Chưa kiểm flood protection có báo nhầm dưới tải cao hay không**~~
    **✅ ĐÃ LÀM (2026-08-02), KHÔNG THẤY BÁO NHẦM** — làm chung với TEST-MATRIX
    row 23 đúng như đề xuất, ra thành test thật `e2e/flood-protection.spec.ts`
    (2 case, chạy `npx playwright test e2e/flood-protection.spec.ts
    --project=chromium` xanh 2 lần liên tiếp, kể cả khi 2 case chạy song song
    2 worker).
    - **Case dương (row 23):** 1 socket bắn liên tục ~200 event/s (gấp 4 lần
      ngưỡng 50) → nhận đúng nhiều cảnh báo `room:error`, rồi bị
      `socket.disconnect(true)` sau đúng `FLOOD_DISCONNECT_STREAK=5` cửa sổ vi
      phạm liên tiếp (khớp code, không sai lệch số cửa sổ).
    - **Case âm (B24):** 300 socket đồng thời, mỗi socket giữ nhịp 40 event/s
      (dưới ngưỡng 50), tổng toàn server = 12 000 event/s → **0 cảnh báo oan, 0
      bị ngắt oan**. Đo tay thêm ở mức khắc nghiệt hơn (500 socket × 45/s = 22
      500 event/s, sát ngưỡng 50 hơn) vẫn **0 báo nhầm**.
    - **Kết luận: thiết kế đếm theo closure-riêng-từng-socket (không có bộ đếm
      dùng chung) chịu được tải tổng cao mà không báo nhầm, kể cả khi timer
      1s/socket có thể bị trễ dưới áp lực event loop.** Không cần sửa gì.
    - **Lưu ý trung thực (2026-08-02, phát hiện khi làm B19-B22 ngay sau đó):**
      chạy lại `e2e/flood-protection.spec.ts` để double-check sau 1 phiên tải
      nặng khác (B19-B22, dựng/huỷ 784+ ván) trên **cùng 1 tiến trình server**
      → case âm **fail đúng 1 lần** (`falseDisconnects` > 0). Restart server
      sạch rồi chạy lại **10/10 lần liên tiếp đều xanh**; chạy thêm 4 lần ngay
      sau lần fail (chưa restart) cũng xanh cả 4. Tổng: **14/15 lần xanh**, 1
      lần fail xảy ra ngay sau khi tiến trình server vừa xử lý xong một đợt
      tải nặng không liên quan. **Chưa đủ bằng chứng để coi đây là bug thật**
      (không lặp lại được khi thử lại có chủ đích), nhưng cũng chưa loại trừ
      hẳn được khả năng dồn GC/event-loop từ đợt tải trước đó làm 1 cửa sổ bị
      trễ thật. Nếu `e2e/flood-protection.spec.ts` fail lại trong CI hay lần
      chạy sau, đừng coi là flaky-test-nên-retry — đối chiếu xem ngay trước đó
      server có vừa xử lý tải nặng khác không trước khi kết luận.
      Chi tiết đầy đủ: `docs/stress-test-report.md` (đoạn bổ sung).

25. ~~**Đường từ chối ở cap thật chưa được test dưới burst**~~
    **✅ ĐÃ ĐO (2026-08-02), KHÔNG THẤY LỖI** — chạy đúng ở cap production
    (`MAX_ROOMS_PER_IP = 3`, `MAX_USERS_PER_ROOM = 20`, không nâng gì):
    (A) bắn 15 lệnh `room:create` đồng thời từ cùng 1 IP → đúng **3** thành công,
    12 bị từ chối sạch bằng `room:error` (0 timeout/rơi gói im lặng), và 1 lệnh
    tạo tiếp **sau khi** đợt burst đã lắng vẫn bị từ chối đúng — tức bộ đếm quota
    không bị lệch (không có "ghost room" nào latent làm sai số đếm).
    (B) bắn 40 lệnh `room:join` đồng thời vào **1** phòng (đã có sẵn 1 người) →
    đúng **19** thành công (= `MAX_USERS_PER_ROOM - 1`), 21 bị từ chối sạch bằng
    `room:error`, 0 timeout.
    **Kết luận: cả 2 cap đều đúng thiết kế dưới burst đồng thời, không có race,
    không rò phòng/người.** Không cần sửa gì. Harness:
    `docs/stress-test-report.md` (đoạn bổ sung).

26. ~~**Harness đo tải hiện chỉ là script tạm, chưa vào repo**~~
    **✅ ĐÃ LÀM (2026-08-02)** — người dùng xác nhận muốn đo định kỳ nên đã viết
    thành harness thật, nằm ngoài `e2e/*.spec.ts` (phá hoại tài nguyên, không
    trộn vào suite chức năng): `scripts/capacity-test/{orchestrator.js,
    worker.js,README.md}`.
    - **Đa tiến trình thật**: `orchestrator.js` dùng `child_process.fork` chia
      số phòng cho N tiến trình OS riêng (`worker.js`), không phải 1 event
      loop giả lập nhiều kết nối — đúng hướng Phần A #7 nêu, dù không giải
      quyết được A7 (đa máy) mà chỉ đa tiến trình cùng máy.
    - **Nhịp người thật**: mỗi nước có độ trễ ngẫu nhiên có thể chỉnh
      (mặc định 1200-3500ms), không còn nén cố định 400ms.
    - **Ngưỡng pass/fail rõ ràng**: tỉ lệ tạo phòng thành công tối thiểu, p95
      độ trễ nước đi tối đa, 0 lỗi khi chơi — exit code 0/1, không chỉ in số.
    - `server/config.js`: `MAX_ROOMS`/`MAX_ROOMS_PER_IP`/`MAX_USERS_PER_ROOM`
      giờ đọc được từ env (mặc định giữ nguyên giá trị production 10/3/20) để
      harness đổi tải mà không phải sửa file đã track mỗi lần — thay cho cách
      sửa tạm + `git checkout` trước đây ở mục 19-25.
    - **Phát hiện phụ khi chạy thử**: chạy nhiều tiến trình trên cùng 1 máy
      chia sẻ chung 1 IP nên bị `MAX_ROOMS_PER_IP` (không phải `MAX_ROOMS`)
      giới hạn trước — khớp đúng phát hiện đã xác nhận ở mục 25, không phải
      bug của harness; đã đổi mặc định `--rooms=3 --workers=3` cho đúng. Và:
      đóng socket thô (không phát `room:leave`) giữ phòng qua
      `DISCONNECT_GRACE_MS` (60s) trước khi nhả quota — đã sửa `worker.js`
      phát `room:leave` (đợi ack `room:left`) trước khi đóng để nhả ngay,
      chạy 2 lần liên tiếp không cần đợi xác nhận ổn.
    - Đã chạy thật để xác minh: ở cap production (`--rooms=3`) PASS 3 lần liên
      tiếp; ở cap nâng tạm (`MAX_ROOMS=20 MAX_ROOMS_PER_IP=20`, server phụ ở
      cổng 3099, đã tắt sau khi xong) `--rooms=20 --workers=5` PASS. `npm test`
      (284 test) vẫn xanh sau khi đổi `server/config.js`.

### Nguồn: truy nguyên trần kết nối (2026-08-02, xem `docs/stress-test-report.md` §10)

27. ~~**Hàng đợi accept TCP tràn — mất 12-14% kết nối ở burst lớn**~~
    **✅ ĐÃ SỬA (2026-08-02), CHƯA COMMIT** — đây là **bug thật đầu tiên** tìm
    được từ toàn bộ đợt đo tải, và là nguyên nhân gốc của trần ~3000 người ghi
    ở mục 7.
    - **Lỗi:** `server.listen(port, cb)` của Node dùng backlog mặc định **511**.
      Khi hàng nghìn kết nối MỚI ập đến cùng lúc, hàng đợi accept của kernel đầy
      và mọi SYN tiếp theo bị **drop im lặng**.
    - **Vì sao khó thấy:** drop xảy ra ở tầng kernel, **dưới** ứng dụng — không
      log, không event lỗi, CPU server chỉ ~26-42% một core trông rất khoẻ.
      Triệu chứng duy nhất là `connect timeout` ở **phía client**, rất dễ bị
      hiểu nhầm là lỗi mạng/client.
    - **Bằng chứng đo trực tiếp** (không suy đoán): `TcpExtListenOverflows`
      trong `/proc/net/netstat` tăng **+14 003** trong 1 lần chạy 4000 người ở
      backlog 511; sau khi sửa còn +3 118 và **không mất kết nối nào**.
    - **Sửa:** `server/index.js` truyền backlog tường minh
      (`server.listen({ port, backlog: config.LISTEN_BACKLOG })`), hằng số
      `LISTEN_BACKLOG` trong `server/config.js` mặc định **4096**, đổi được qua
      env. Kernel tự kẹp theo `net.core.somaxconn` nên đặt cao **an toàn**,
      máy nào cho phép ít hơn thì tự giảm chứ không lỗi.
    - **Kết quả:** 4000 người kết nối đồng thời, **đúng cấu hình transport mặc
      định đang ship**: từ 86-88% (240-282 lỗi) → **100%, 0 lỗi**, lặp lại 2 lần.
    - **Unit test:** `server/tests/listen-backlog.test.js` (5 test) — đã kiểm
      chứng là **fail đúng khi revert bản sửa**, không phải test luôn xanh.
      `npm test` 289/289 xanh.

28. **Thứ tự transport `websocket` trước `polling` — đã đo, CỐ Ý CHƯA ÁP DỤNG**
    - Đo được: ở 4000 người, backlog 511, `['polling','websocket']` (mặc định
      socket.io, đang ship) = 88.0% / 240 lỗi; `['websocket']` = 100% / 0 lỗi;
      `['websocket','polling']` + `tryAllTransports` = **100% / 0 lỗi mà vẫn
      giữ được fallback polling**.
    - **Chưa áp dụng vì:** riêng bản sửa backlog (mục 27) đã đưa cấu hình mặc
      định về 100% ở 4000 người rồi. Đổi thứ tự transport ảnh hưởng đường kết
      nối của **mọi client thật** (kể cả người sau proxy chặn WebSocket — đúng
      lý do socket.io mặc định polling trước), nên phải là một thay đổi riêng
      có lý lẽ riêng, không gộp vào bản sửa backlog.

29. **Trần >6000 người vẫn chưa quy được nguyên nhân** — sau khi sửa backlog,
    ở 6000 người: **0** `ListenOverflows` (hàng đợi accept đã hết tràn hoàn
    toàn) nhưng tỉ lệ thành công vẫn ~75%, CPU server chỉ ~26%. Tăng số tiến
    trình sinh tải (8 → 16) **không cải thiện**, nên không phải chỉ do số
    tiến trình harness. Nghi phạm còn lại chưa tách bạch được: đường handshake
    engine.io đơn luồng, `jwt.verify` mỗi kết nối trên main thread, hoặc chính
    khả năng mở 6000 socket dồn dập của máy chạy test. **Chưa sửa gì** — giữ
    đúng quy tắc "tái hiện → đo → mới sửa", ghi lại là chưa giải thích được
    thay vì đoán.

---

<!-- Khi nhận báo cáo mới: thêm heading "### Nguồn: <tên báo cáo>" dưới đúng
     Phần A hoặc Phần B, giữ định dạng số thứ tự + đánh giá hiệu quả/an toàn +
     trạng thái test như trên. -->
