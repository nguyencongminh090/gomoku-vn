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
- **✅ Đã xác nhận + sửa xong (2026-08-02):** deploy thật dùng **Cloudflare
  Tunnel** (`cloudflared`, chạy cùng máy, kết nối vào Node qua loopback) — TLS
  do Cloudflare xử lý, coi như xong phần này. Phần code còn thiếu (`trust
  proxy` + đọc `X-Forwarded-For` ở tầng socket) đã sửa, xem TODO.md mục #30 và
  `docs/fix-log.md`.

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

### Nguồn: security review toàn bộ codebase (2026-08-03, yêu cầu người dùng "Does my website safe?")

#### 9. Audit an ninh toàn bộ server + client — không phải diff, không có PR đang mở

- Bối cảnh: `main` sạch, không có commit/diff đang chờ (`git status` "nothing to
  commit"), nên không dùng được flow `/security-review` chuẩn (vốn review diff).
  Đã chuyển sang audit toàn bộ codebase qua sub-agent thay vì review diff rỗng.
- Phạm vi đã kiểm: SQL injection (`server/db/database.js`, `server/routes/
  games.js`), stored XSS qua `displayName`, JWT lưu ở `localStorage`, JWT alg
  confusion/`alg:none`, authorization bypass nước đi/lượt (`GameEngine.js`),
  authorization phòng (host-only actions, `RoomManager.js`), SQL interpolation
  trong `server/scripts/admin.js`, lộ id nội bộ qua `/api/games`.
- **Kết quả: không có finding HIGH/MEDIUM đạt ngưỡng tin cậy ≥0.8.** Toàn bộ 8
  candidate đều bị loại (confidence exploit 1-2/10) — chi tiết lý do loại từng
  cái nằm trong báo cáo đã gửi người dùng (không chép lại ở đây, xem lịch sử
  hội thoại nếu cần tra lại lý do cụ thể của từng candidate).
- **Điểm không đạt ngưỡng "finding" nhưng đáng ghi nhận (không phải lỗ hổng
  đang mở, là thiếu phòng thủ chiều sâu):** `isValidDisplayName`
  (`server/routes/auth.js`) chỉ kiểm độ dài (2-24 ký tự), không giới hạn ký
  tự — thứ duy nhất chặn stored XSS qua `displayName` là việc mọi điểm render
  phía client (`room-ui.js`, `lobby.js`, `history.js`) đều gọi đúng
  `escapeHtml`/`escapeAttr`/`escapeJsString` trước khi chèn vào `innerHTML`.
  Không có lớp chặn nào ở nguồn (server) nếu một điểm render tương lai quên
  escape. **Đã tách thành việc sửa được bằng code → xem Phần B #32.**

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
   **Hạn chế đã biết, đã sửa (2026-08-02, xem mục #30):** sau reverse
   proxy/tunnel thì mọi kết nối từng mang IP của proxy → gộp chung 1 quota;
   `getClientIp()` (`server/socket/state.js`) đã sửa việc này.
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

   **✅ Phần delta "xa hơn" cũng đã làm xong (2026-08-03)** — loại hẳn độ phức
   tạp O(n²) còn lại (không chỉ giảm hằng số như bản trên): thêm
   `broadcastRoomUpdate(io, room[, opts])` trong `server/socket/state.js`,
   diff `users[]` thành `{upserts, removed}` theo từng người (chỉ user nào
   thật sự đổi field mới vào `upserts`, kể cả đổi `role` do host handover) và
   `scoreTable` chỉ gửi khi thật sự đổi — cùng kỹ thuật diff-tại-lúc-phát đã
   dùng cho `lobby:patch` (mục 9), áp dụng thêm cho `room:updated`. Cả **17/17
   điểm gọi** đổi sang `broadcastRoomUpdate` (điểm settings dùng
   `{ settings: true }`). Client `room-socket.js` merge `users` theo `userId`
   (Map, giống `lobby.js`) thay vì gán thẳng cả mảng. Thêm
   `clearRoomUpdateSnapshot(roomId)` gọi từ sự kiện `room_destroyed`
   (`SocketHandler.js`) để không rò rỉ Map theo thời gian.
   Test: file mới `server/tests/room-update-delta.test.js` (13 case: upsert
   đầu tiên, không đổi thì bỏ hẳn `users`, chỉ đúng 1 user đổi thì chỉ user đó
   vào `upserts`, rời phòng vào `removed`, host handover đổi role cả 2 phía,
   2 phòng diff độc lập nhau, `scoreTable` tương tự, field vô hướng luôn gửi,
   `settings` chỉ khi yêu cầu, `clearRoomUpdateSnapshot` reset đúng baseline);
   cập nhật lại test guard "17 điểm emit" trong `RoomManager.test.js` (đếm
   `broadcastRoomUpdate(io` thay vì `serializeRoomUpdate(` trực tiếp — điểm
   emit thô giờ chỉ còn đúng 1 chỗ, bên trong `broadcastRoomUpdate`).
   Mutation-check: revert `state.js` → cả 13 test đỏ (function không tồn tại);
   mutation tinh hơn (bỏ điều kiện diff, luôn gửi full `users`) → đúng 3/13
   test đỏ (những test kiểm tra "bỏ hẳn khi không đổi"), không phải toàn bộ —
   xác nhận test bắt đúng hành vi chứ không chỉ bắt "hàm có tồn tại không".
   `npm test`: 313/313 xanh (+13 case). Bump `?v=36` → `?v=37`.
   **Đã kiểm bằng browser thật** (Playwright, không phải chỉ tin unit test):
   chạy lại **toàn bộ 18 file spec `e2e/*.spec.ts`** sau khi restart server
   dev (code server không hot-reload), từng file/nhóm file riêng để tránh
   cạn quota `MAX_ROOMS_PER_IP=3` dùng chung 1 IP loopback giữa các lần chạy
   — **tất cả pass**, gồm cả các luồng đụng trực tiếp `room:updated`: sit/
   stand/ready/kick/leave/disconnect-resume/host-transfer/spectator-join/
   swap2/resign/draw-offer. **Bài học phương pháp:** lần đầu chạy dồn cả 18
   file cùng lúc ra hàng loạt lỗi giả `#room-id-nav` rỗng — không phải do code
   sai, mà do (1) server dev đang chạy từ trước phiên này, còn giữ code cũ
   trong bộ nhớ (client là static file đọc lại mỗi request, còn server-side
   code Node cache theo tiến trình, cần restart) và (2) nhiều spec tạo phòng
   liên tiếp trong cùng 1 tiến trình server dùng chung 1 IP cộng dồn vượt
   `MAX_ROOMS_PER_IP=3` — đúng giới hạn đã biết từ `scripts/capacity-test/
   README.md`, không phải bug mới.

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

### Nguồn: điều tra #18 vòng 2 trên `play3cr.dpdns.org` (2026-08-02)

30. ~~**`MAX_ROOMS_PER_IP` có thể đang là cap theo cả site, không phải theo
    từng người dùng thật, khi chạy sau Cloudflare Tunnel**~~
    **✅ ĐÃ SỬA (2026-08-02)**
    - Trong lúc điều tra #18 vòng 2, sửa lỗi crash `trust proxy` (xem
      `docs/fix-log.md` dòng 2026-08-02 21:05) thì phát hiện thêm:
      `socket.handshake.address` (dùng để tính `creatorIp` cho quota, xem
      [server/socket/handlers/LobbyHandler.js:56](server/socket/handlers/LobbyHandler.js#L56))
      đọc thẳng `req.connection.remoteAddress` ở tầng engine.io — **không bao
      giờ** nhìn header `X-Forwarded-For`, bất kể Express có `trust proxy`
      hay không (đó là hai tầng khác nhau, fix vừa rồi chỉ chỉnh Express).
    - Với deployment hiện tại (cloudflared chạy trên cùng máy, kết nối vào
      Node qua loopback), điều này nghĩa là **mọi user thật đều có cùng một
      `creatorIp` là loopback** — quota "tối đa 3 phòng mỗi IP" (thiết kế để
      chặn 1 IP chiếm hết `MAX_ROOMS`) thực chất đang giới hạn **toàn bộ site
      chỉ 3 phòng đang sống cùng lúc**, bất kể có bao nhiêu người dùng khác
      nhau thật sự đang tạo phòng.
    - Ban đầu để ngỏ chờ xác nhận (đây từng là Phần A #1 — "không sửa được
      bằng code" — vì chưa biết deployment thật có proxy gì, hop bao nhiêu).
      Buổi làm việc tiếp theo xác nhận rõ: đúng là Cloudflare Tunnel, đúng 1
      hop qua loopback — đủ thông tin để sửa an toàn, không còn là quyết định
      ngoài code nữa.
    - **Sửa:** thêm `getClientIp(socket)` (`server/socket/state.js`) — cùng
      logic với `trust proxy: 'loopback'` phía Express: chỉ đọc
      `X-Forwarded-For` khi chính `socket.handshake.address` là loopback,
      nếu không thì dùng `socket.handshake.address` như cũ. Không cho phép
      giả mạo `X-Forwarded-For` để né quota nếu port lỡ bị lộ ra ngoài trực
      tiếp (không qua tunnel). `LobbyHandler.js` dùng hàm này thay vì đọc
      `socket.handshake.address` trực tiếp.
    - **Test:** `server/tests/LobbyHandler.test.js` — 3 test mới (dùng địa
      chỉ thường, dùng địa chỉ sau proxy loopback + forwarded header, và
      không tin forwarded header khi kết nối không thực sự là loopback).
      Mock `state` lấy `getClientIp` thật qua `jest.requireActual` thay vì
      viết lại logic riêng, tránh lệch với bản thật. Mutation-check: revert
      riêng `state.js` → 6 test fail (3 mới + 3 cũ phụ thuộc field `ip`) →
      khôi phục → `npm test`: 298/298 xanh.

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

28. ~~**Thứ tự transport `websocket` trước `polling` — đã đo, CỐ Ý CHƯA ÁP DỤNG**~~
    - Đo được: ở 4000 người, backlog 511, `['polling','websocket']` (mặc định
      socket.io, đang ship) = 88.0% / 240 lỗi; `['websocket']` = 100% / 0 lỗi;
      `['websocket','polling']` + `tryAllTransports` = **100% / 0 lỗi mà vẫn
      giữ được fallback polling**.
    - **Chưa áp dụng vì:** riêng bản sửa backlog (mục 27) đã đưa cấu hình mặc
      định về 100% ở 4000 người rồi. Đổi thứ tự transport ảnh hưởng đường kết
      nối của **mọi client thật** (kể cả người sau proxy chặn WebSocket — đúng
      lý do socket.io mặc định polling trước), nên phải là một thay đổi riêng
      có lý lẽ riêng, không gộp vào bản sửa backlog.

    **✅ ĐÃ ĐO LẠI + ÁP DỤNG (2026-08-02, phiên sau)** — đo lại đúng bằng
    `scripts/capacity-test/` như hướng dẫn (không tin số cũ), backlog fix đã
    live:
    - Ở **4000 người** (đúng mốc so sánh cũ): cả 2 thứ tự đều **100%/0 lỗi** —
      xác nhận đúng lý do "chưa áp dụng" ban đầu vẫn đúng **ở mốc đó**: bản sửa
      backlog một mình đã đủ.
    - Nhưng đẩy lên **6000 người** (đúng mức mục #29 đang điều tra) thì thấy
      khác biệt thật: 6 lần chạy xen kẽ (3 mặc định, 3 websocket-trước, xen kẽ
      để loại trừ trôi dạt trạng thái server) → mặc định 74-80%, websocket-
      trước 90-100% — chênh ~15 điểm %, không phải nhiễu.
    - **Quyết định: áp dụng.** Lý do tiền đề "chưa áp dụng" đã thay đổi — tiền
      đề đó chỉ đúng ở mốc 4000, không đúng ở 6000 nơi 2 thứ tự tách biệt rõ và
      mặc định thua. Rủi ro tương thích proxy (client sau proxy chặn WebSocket)
      **vẫn có thật và vẫn chưa đo được** trong phiên này (không có client thật
      sau proxy chặn WebSocket để thử) — nhưng `tryAllTransports` chặn rủi ro
      đó ở mức "mất thêm 1 lần thử transport thất bại trước khi rơi về
      polling", không phải mất kết nối hẳn, nên rủi ro có giới hạn trong khi
      lợi ích đã đo được là thật.
    - **Sửa:** `client/js/socket-client.js` — `io({...})` thêm
      `transports: ['websocket', 'polling']` và `tryAllTransports: true`.
      Bump `?v=35` → `?v=36` (đủ 4 file HTML + 3 file entry JS).
    - **Test:** `client/js/` không có hạ tầng unit test (đúng như mọi fix
      `client/js/` khác trong `docs/fix-log.md`) — viết Playwright mới
      `e2e/websocket-first-transport.spec.ts`, chặn network request +
      lắng nghe event `websocket` của trang, assert kết nối thường mở thẳng
      WebSocket (`transport=websocket` trong URL) mà **không** có request
      `transport=polling` nào trước đó, và banner kết nối không bao giờ hiện
      trạng thái mất kết nối. Mutation-check: revert riêng `socket-client.js`
      → tái hiện đúng 5 request polling trước khi có WebSocket, test đỏ →
      khôi phục, xanh lại. `npm test`: 299/299 xanh (không đổi, đây là thay
      đổi client-only).
    - **Đo lại sau khi sửa:** 4000 người vẫn 100%/0 lỗi (không hồi quy), 6000
      người tăng từ 74-80% (mặc định) lên 90-100% (websocket-trước), 3 lần
      chạy mới. Chi tiết đầy đủ: `docs/fix-log.md`.

29. **Trần >6000 người vẫn chưa quy được nguyên nhân** — sau khi sửa backlog,
    ở 6000 người: **0** `ListenOverflows` (hàng đợi accept đã hết tràn hoàn
    toàn) nhưng tỉ lệ thành công vẫn ~75%, CPU server chỉ ~26%. Tăng số tiến
    trình sinh tải (8 → 16) **không cải thiện**, nên không phải chỉ do số
    tiến trình harness. Nghi phạm còn lại chưa tách bạch được: đường handshake
    engine.io đơn luồng, `jwt.verify` mỗi kết nối trên main thread, hoặc chính
    khả năng mở 6000 socket dồn dập của máy chạy test. **Chưa sửa gì** — giữ
    đúng quy tắc "tái hiện → đo → mới sửa", ghi lại là chưa giải thích được
    thay vì đoán.

    **🟡 ĐÃ ĐIỀU TRA TIẾP + SỬA MỘT PHẦN (2026-08-02, phiên sau)** — chạy lại
    đúng `scripts/capacity-test/` ở 6000 người trong phiên làm việc này (cùng
    hình dạng máy 8 core/Node v22 như báo cáo gốc, nhưng là một sandbox khác —
    số tuyệt đối không so trực tiếp được với báo cáo gốc, nhưng phương pháp và
    kết luận định tính thì có giá trị). Tái hiện được trần: 6000 người → 72-78%
    thành công, toàn bộ lỗi là `connect timeout`.
    - **`jwt.verify` — LOẠI TRỪ.** Chạy lại đúng burst 6000 người trên server
      có `jwt.verify` bị thay bằng decode không kiểm chữ ký (`--require`
      preload, không đụng file gốc) → tỉ lệ thành công gần như y hệt (77.5% so
      với 77-78% bản gốc). Không phải nghi phạm.
    - **Tìm được nguyên nhân thật, đã sửa:** lấy `--cpu-prof` thật của server
      đúng lúc burst thất bại, thấy `getOnlineUsersList()`/broadcast
      `lobby:online_users` (`server/socket/SocketHandler.js`) nằm trong top
      self-time. Hàm này quét + sort **toàn bộ** session đang kết nối (O(n))
      và bắn lại cho cả phòng lobby — nhưng lại chạy trên **MỖI LẦN** connect
      và disconnect riêng lẻ, tức là O(n) chạy lặp lại n lần trong 1 đợt burst
      n người = **O(n²)** tổng cộng. Xác nhận bằng thực nghiệm nhân-quả (không
      chỉ suy đoán từ tương quan): tắt tạm 2 điểm gọi này (bản nháp, không
      commit) → tỉ lệ thành công ở đúng 6000 người tăng từ baseline 72-78% lên
      83-86%.
    - **Đã sửa thật (xem `docs/fix-log.md` 2026-08-02 22:41):** debounce
      broadcast `lobby:online_users` 300ms, dùng đúng pattern
      `broadcastLobbyUpdate()` đã có sẵn trong `state.js` (per-`io` WeakMap
      timer). `npm test`: 299/299 xanh, mutation-check xanh.
    - **Chưa đóng mục này** — sau khi sửa, 6000 người vẫn chỉ 73-86% (3 lần
      chạy), cải thiện thật nhưng chưa hết. Còn lại, đo được nhưng CHƯA sửa:
      (a) fine-grained CPU sampling (5 mẫu/giây qua `/proc/PID/stat`, chính
      xác hơn nhiều so với `%CPU` kiểu trung bình trượt của `ps` mà báo cáo gốc
      dùng để ra con số "~26%") cho thấy CPU server thật ra **vọt tới
      100-190%** của 1 core trong đúng khung burst — tức là con số "~26%,
      không phải nghẽn CPU" của báo cáo gốc **rất có thể là artefact của cách
      đo thô** (1 mẫu/giây bằng `ps`), không phải kết luận đúng; (b) profile
      cũng lộ ra ~10% thời gian nằm trong transaction SQLite đồng bộ của
      `saveGame()` — nhưng đây là chi phí phụ thuộc hình dạng workload của
      chính harness (mọi phòng test đều kết thúc bằng `room:leave` giữa ván
      → coi là đầu hàng, gọi `saveGame()`), **chưa xác nhận** đây là chi phí
      chung của traffic thật, nên **chưa sửa**. Đúng quy tắc "tái hiện → đo →
      mới sửa": chỉ sửa phần đã xác nhận nhân-quả (broadcast O(n²)), phần còn
      lại ghi lại là chưa isolate xong (cần profiling sâu hơn — flame graph —
      ngoài phạm vi phiên này) thay vì đoán và sửa theo suy đoán.

### Nguồn: yêu cầu người dùng, dựa trên số liệu stress test (2026-08-03)

31. ~~**Nâng `MAX_ROOMS`/`MAX_USERS_PER_ROOM` — có dư địa kỹ thuật, người dùng
    quyết định con số**~~
    **✅ ĐÃ SỬA (2026-08-03)** — người dùng hỏi thẳng "test result cho thấy có
    thể tăng số user, có nâng không?" sau khi tôi chỉ ra `docs/stress-test-
    report.md` §8 đã ghi rõ: cap 200 room-members (`MAX_ROOMS=10 ×
    MAX_USERS_PER_ROOM=20`) là quyết định **chống spam/abuse**, không phải
    giới hạn hiệu năng — server đã đo sạch tới ~3000-4000 người đồng thời.
    Người dùng chốt số: `MAX_ROOMS=50`, `MAX_USERS_PER_ROOM=40` (2000
    room-members tối đa, vẫn có margin rộng dưới ngưỡng ~3000-4000).
    - **Sửa:** đổi default trong `server/config.js` (10→50, 20→40).
      **Cố ý không đổi `MAX_ROOMS_PER_IP` (giữ 3)** — người dùng không yêu
      cầu, và pool càng lớn thì cap 3/IP càng có ý nghĩa hơn về mặt chống
      abuse (3/50 = 6% so với 3/10 = 30% trước đây), không phải nới lỏng.
      Đã nêu rõ điểm này với người dùng trước khi sửa, không tự ý đổi thay.
      Sửa luôn comment lỗi thời ở `RoomManager.js` ("MAX_ROOMS is 10") và cập
      nhật bảng biến môi trường trong `README.md` +
      `scripts/capacity-test/README.md` (đang mô tả default cũ).
    - **Test:** file mới `server/tests/room-capacity-config.test.js` (8 case,
      cùng pattern với `listen-backlog.test.js` — pin đúng giá trị mặc định
      mới 50/40, override qua env, fallback khi input không phải số, và xác
      nhận `MAX_ROOMS_PER_IP` vẫn là 3/vẫn là tỷ lệ nhỏ so với `MAX_ROOMS`
      mới). Thêm describe block mới trong `RoomManager.test.js` (3 case) —
      trước đây **chưa có test nào** phủ riêng cap `MAX_ROOMS` (chỉ có
      `MAX_ROOMS_PER_IP`) dù đây là dòng code đầu tiên chạy trong
      `createRoom()`: tạo đủ `MAX_ROOMS` phòng trải trên nhiều IP khác nhau
      (né `MAX_ROOMS_PER_IP`), xác nhận phòng thứ N+1 (từ IP hoàn toàn mới)
      vẫn bị từ chối, và huỷ 1 phòng thì nhả đúng 1 chỗ trống.
      Mutation-check: revert `config.js` → đúng 5/8 test ở file mới đỏ (các
      test kiểm literal 50/40), phần còn lại xanh vì dùng so sánh tương đối
      — xác nhận test bắt đúng giá trị cụ thể chứ không phải chỉ hành vi
      chung chung. `npm test`: 324/324 xanh (+11 case).
    - **Đã kiểm bằng server thật + socket thật** (không chỉ unit test
      RoomManager): tạo 1 phòng, cho 40 guest thật (JWT tự ký, cùng bypass
      dùng trong `scripts/capacity-test/`) lần lượt join → đúng **39** vào
      được (host + 39 = 40 = cap), người thứ 40 bị từ chối sạch bằng
      `"Phòng đã đầy."`, khớp chính xác dự đoán.
    - **Không thuộc phạm vi việc này** (không tự ý đổi): `MAX_ROOMS_PER_IP`.
      Nếu sau này muốn nới thêm `MAX_ROOMS`, nên xem lại tỷ lệ này cùng lúc.

### Nguồn: security review toàn bộ codebase (2026-08-03)

32. ~~**Giới hạn ký tự cho `displayName` — defense-in-depth, không phải lỗ hổng
    đang mở**~~
    **✅ ĐÃ XONG (2026-08-03)** — `isValidDisplayName` (`server/routes/auth.js`)
    nay ngoài kiểm độ dài (2-24 ký tự, giữ nguyên) còn từ chối `DISPLAY_NAME_
    FORBIDDEN`: 5 ký tự có ý nghĩa trong HTML/attribute/JS-string (`< > & " '`)
    + control character C0/C1 (`U+0000-U+001F`, `U+007F-U+009F` — bao gồm
    xuống dòng, tab, NUL, ký tự định dạng vô hình).
    - **Chọn deny-list, KHÔNG allow-list ASCII** — đúng ràng buộc quan trọng
      nhất của `instruction.md` §B32. Tên tiếng Việt có dấu ("Nguyễn Văn A"),
      chữ Latin-1 có dấu, chữ CJK... đều **qua được**; đây là phần dễ hỏng
      nhất nên test bên accept quan trọng ngang test bên reject.
    - **Chỉ đúng 1 call site**: `POST /api/auth/register`. **Đính chính mô tả
      gốc của mục này** — repo **không có route đổi tên hiển thị** nào (mô tả
      cũ viết "khi đăng ký/đổi tên hiển thị"); tên khách do server tự sinh từ
      `config.GUEST_NAME_ADJECTIVES/NOUNS` nên không đi qua hàm này.
    - **Cố ý KHÔNG mở rộng phạm vi** (rule scope discipline): không chặn thêm
      backtick/backslash dù cùng lý lẽ — không nằm trong danh sách §B32 đưa
      ra. Lớp escape phía client giữ nguyên, đây là lớp chặn **thêm** ở nguồn,
      không thay thế.
    - **Thu hẹp đã biết, chấp nhận:** cấm `'` cũng chặn luôn tên thật kiểu
      "O'Brien"/"D'Angelo" — không phải rủi ro với người dùng Việt (đối tượng
      của app), và `'` đúng là ký tự thoát ra khỏi ngữ cảnh
      `onclick="joinRoom('…')"` mà repo này đang dùng — nhưng đây là đánh đổi
      thật, không phải lợi ích miễn phí.
    - **Không đụng file `client/`** → không bump `?v=N`. Chỉ sửa thêm thông
      báo lỗi 400 để nói rõ vi phạm luật ký tự, không phải luật độ dài.
    - **Test:** file mới `server/tests/auth-display-name.test.js`, 25 case
      chạy qua route thật (hàm là module-private, và route mới là thứ thật sự
      gác cửa vào DB): 9 case accept (tiếng Việt có dấu, khoảng trắng giữa
      tên, Latin-1, CJK, biên 2 và 24 ký tự, trim, dấu câu không phải HTML),
      12 case reject (payload thẻ, `<`, `>`, `&`, `"`, `'`, img/onerror,
      newline, CR, tab, NUL, C1), + reject theo độ dài vẫn chạy, reject
      non-string, thông báo lỗi có nhắc luật ký tự, và tên bị từ chối **không
      bao giờ** tới `db.createUser` lẫn `bcrypt.hash`.
      **Mutation-check** (trên bản copy tạm, không sửa file gốc): khôi phục
      bản chỉ-kiểm-độ-dài → **đúng 11/25 đỏ** (toàn bộ phía reject), 9 case
      accept + case độ dài vẫn xanh — xác nhận test bắt đúng hành vi mới chứ
      không phải chỉ bắt "hàm có tồn tại". `npm test` 359/359 xanh.
      `express-rate-limit` bị stub thành pass-through **chỉ trong file test
      này** (ma trận ký tự cần ~30 request register từ 1 IP, vượt hạn mức
      20/15 phút của `authLimiter`) — ngưỡng production không đổi, đúng luật
      "đừng nới rate limiter trong code production chỉ để tự test được".
    - **Ngoài phạm vi, ghi lại chứ chưa làm:** ký tự Unicode gây giả mạo hiển
      thị (zero-width, RTL override `U+202E`, homoglyph) vẫn qua được — đó là
      mối đe doạ *spoofing tên*, khác với XSS mà §B32 nhắm tới. Nếu sau này
      thấy cần thì mở mục riêng, không gộp ngược vào đây.

### Nguồn: security review toàn bộ codebase — recheck (2026-08-03)

Đợt recheck sau mục 32: audit lại từ đầu (không tin kết luận cũ), tập trung
vào các đường ít bị soi hơn (thoả thuận hoà, cộng giờ). Cả 2 finding dưới đây
đã qua vòng lọc false-positive riêng (sub-task độc lập, đọc code trực tiếp,
confidence ≥ 8/10) trước khi đưa vào đây.

33. ~~**Chấp nhận/từ chối đề nghị hoà không kiểm tra tư cách người chơi**~~
    **✅ ĐÃ XONG (2026-08-04)** — thêm đúng kiểm tra
    `const player = this.players.find(p => p.userId === userId); if (!player) return { error: 'Bạn không phải người chơi.' };`
    vào đầu `acceptDraw()` và `declineDraw()` (`server/managers/GameEngine.js`),
    copy nguyên pattern có sẵn từ `resign()`/`offerDraw()` trong cùng file,
    đúng như `instruction.md` §B33. Không đụng tầng handler
    (`GameHandler.js`) — kiểm tra đặt ở `GameEngine` để bảo vệ mọi lối gọi
    tương lai, không chỉ lối gọi qua socket hiện tại.
    Test: +2 case trong `GameEngine.test.js` (describe "Draw offer") — khán
    giả (`userId` không nằm trong `players`) gọi `acceptDraw`/`declineDraw`
    khi có `drawOffer` đang chờ, assert bị từ chối đúng thông báo
    `'Bạn không phải người chơi.'` và trạng thái ván/`drawOffer` không đổi.
    Mutation-check: revert riêng `GameEngine.js` → cả 2 case đỏ đúng dự kiến
    → khôi phục → xanh lại. `npm test`: 361/361 xanh (+2 case). Chi tiết:
    `docs/fix-log.md`.

34. ~~**Chấp nhận/từ chối yêu cầu cộng giờ không kiểm tra tư cách người chơi**~~
    **✅ ĐÃ XONG (2026-08-04)** — thêm đúng kiểm tra
    `const player = room.gameState.players.find(p => p.userId === user.userId); if (!player) { socket.emit('game:error', { message: 'Bạn không phải người chơi.' }); return; }`
    vào đầu `game:time_accept` (`server/socket/handlers/GameHandler.js`) và
    `game:time_decline`, trước logic kiểm `room._timeRequestPending`, theo
    đúng pattern có sẵn của `game:request_time` như `instruction.md` §B34
    chỉ định. Giữ nguyên ở tầng handler (không chuyển state
    `_timeRequestPending` sang `GameEngine`), khớp lý do đã nêu trong §B34
    (state này thuộc `room`, không phải `GameEngine`).
    Test: file mới `server/tests/GameHandler.test.js` (4 case) — khán giả
    (`userId` không nằm trong `engine.players`) phát `game:time_accept`/
    `game:time_decline` khi có `_timeRequestPending` đang chờ, assert bị từ
    chối đúng thông báo và request không bị xoá/tiêu thụ; kèm 2 case đối
    chứng xác nhận người chơi thật (đối thủ) vẫn accept/decline được bình
    thường. Mutation-check: revert riêng `GameHandler.js` → cả 2 case
    spectator đỏ đúng dự kiến → khôi phục → xanh lại. `npm test`: 365/365
    xanh (+4 case). Chi tiết: `docs/fix-log.md`.

### Nguồn: báo cáo người dùng khi test thủ công (2026-08-03)

35. ~~**`#start-modal` và `#game-overlay` (thông báo Thắng/Thua/Đấu lại) chồng
    lên nhau sau khi ván kết thúc**~~
    **✅ ĐÃ XONG (2026-08-03)** — người dùng xác nhận repro: **lặp lại được ổn
    định** (mọi lần), 2 overlay **chồng hình lên nhau** trực tiếp.
    - **Nguyên nhân gốc, đã xác nhận bằng Playwright (không chỉ giả thuyết
      đọc code):** khi 1 trong 2 người bấm "Đấu lại" trước người kia,
      `game:rematch` (`server/socket/handlers/GameHandler.js:396`) gọi
      `confirmStart` rồi `syncReadyWindow` (vì `allReady` false), set
      `readyDeadline` mới và broadcast `room:updated` tới **cả 2 client**.
      Người **chưa** bấm gì vẫn còn `#game-overlay` hiện, và
      `renderStartModal()` (`client/js/room-ui.js:202`) cũ không kiểm tra
      điều đó trước khi thêm `.visible` vào `#start-modal` → chồng hình.
    - **Hướng sửa đã chọn (thảo luận trực tiếp với người dùng, xem hội
      thoại):** thay vì vá tại điểm hiển thị đơn thuần, đổi luôn mô hình —
      Start Modal chỉ còn 1 nguồn kích hoạt duy nhất: **"tôi đang ngồi vào
      chỗ"**, không phải "phòng có `readyDeadline`" một cách gián tiếp qua
      broadcast. Cụ thể:
      1. **`client/js/room.js` — `btnCloseOverlay`:** trước đây bấm "Đóng"
         chỉ ẩn overlay phía client, không báo gì cho server, để người chơi
         ngồi lại ở trạng thái "còn ngồi nhưng chưa ready" vô thời hạn. Nay
         bấm "Đóng" = **đứng dậy thật** (`window.RoomState.standRequested =
         true; window.RoomClient.emit('room:stand')`) — tái dùng đúng luồng
         `room:stand`/`standUp()` có sẵn cho nút đứng dậy ở ghế, không tạo
         event mới. Hệ quả: `bothSeated` false → `syncReadyWindow` tự huỷ
         ready-window, `readyDeadline` về `null` — không còn trạng thái lửng
         lơ nào để dây vào bug này nữa.
      2. **`client/js/room-ui.js` — `renderStartModal()`:** thêm phòng thủ
         chiều sâu — không hiện `#start-modal` nếu `#game-overlay` đang có
         class `.visible` (đọc DOM trực tiếp), bất kể `readyDeadline` là gì.
         Chặn mọi đường khác (nếu có) có thể dẫn tới cùng bug mà không cần
         lường hết từng đường.
      - **Không đụng:** `btnRematch` (giữ nguyên, chỉ ẩn overlay cục bộ rồi
        emit `game:rematch` — bấm "Đấu lại" khi đang ngồi tương đương xác
        nhận ready, đúng luồng `confirmStart` sẵn có), luồng `syncReadyWindow`
        cho ván đầu tiên của phòng (trước `game:ended` đầu tiên).
      - **Việc phụ đã kiểm, không phải bug riêng:** comment ở
        `server/socket/state.js:342` liệt kê "game end" là 1 mốc phải gọi
        `syncReadyWindow`, nhưng `handleGameEnd` không gọi trực tiếp — không
        cần sửa gì thêm vì hướng sửa trên (gate qua `#game-overlay` +
        đứng dậy khi Đóng) đã loại bỏ hoàn toàn triệu chứng mà không cần
        `handleGameEnd` tự gọi `syncReadyWindow`; để nguyên comment, không
        rõ ràng buộc lịch sử nào khác dựa vào hành vi hiện tại nên không tự
        ý "sửa cho khớp comment".
    - Bump `?v=38` → `?v=39` (đổi `client/js/room.js` + `client/js/
      room-ui.js`).
    - **Test:** file mới `e2e/rematch-overlay-conflict.spec.ts` (Playwright,
      2 case): (1) dựng đúng kịch bản báo cáo — 2 người chơi thật, kết thúc
      ván bằng đầu hàng, PlayerA bấm "Đấu lại" trước, xác nhận PlayerB (chưa
      bấm gì) **không** thấy `#start-modal` hiện trong khi `#game-overlay`
      còn `.visible`, rồi PlayerB bấm "Đóng" và xác nhận `RoomState.mySlot
      === null` (đứng dậy thật) + không phòng nào còn ready-window; (2) case
      hồi quy — 2 ghế mới ngồi vào vẫn hiện Start Modal bình thường (đảm bảo
      fix không vô hiệu hoá tính năng gốc). Chạy trên cả 3 trình duyệt
      (chromium/firefox/webkit) đều xanh.
      **Mutation-check:** revert tạm cả 2 đoạn sửa trên bản copy (không sửa
      file gốc trong lúc kiểm), chạy lại đúng case 1 trên chromium →
      **đỏ đúng ở dòng assert `#start-modal` not visible** (`Received:
      "game-overlay visible"` — bắt được đúng bug được báo cáo), khôi phục
      lại thì xanh. `npm test` (server-side, không đổi) vẫn 359/359 xanh —
      đây là fix thuần client, không đụng code server nào.
      **Client-side hiện chưa có Jest/unit-test framework** (đúng như
      `CLAUDE.md` ghi nhận) nên guard duy nhất cho fix này là e2e Playwright
      ở trên, không có unit test bổ sung.
    - **Đã kiểm bằng browser thật qua Playwright** (không chỉ tin giả định) —
      xem chi tiết Mutation-check ở trên. Chi tiết đầy đủ: `docs/fix-log.md`.

### Nguồn: báo cáo người dùng — lỗi đếm giờ trong luồng Swap2 (2026-08-04)

37. ~~**Timer không chạy trong suốt giai đoạn khai cuộc Swap2, và chạy sai bên
    sau khi Swap2 resolve**~~
    **✅ ĐÃ XONG (2026-08-04)** — người dùng phát hiện khi test thủ công, đã xem
    sơ đồ luồng Swap2 hiện tại (state diagram + sequence diagram, mermaid) do
    agent dựng từ code, rồi tự chốt hướng sửa: **tính giờ ngay từ lúc bắt đầu
    ván, không có giai đoạn nào được miễn trừ** ("Apply Time manager right
    after START game. Không có ngoại lệ"). **Đọc kỹ `instruction.md` §B37
    trước khi làm — thiết kế có 1 điểm dễ làm sai (nhãn placeholder
    black/white trong lúc màu chưa gán), tóm tắt ở đây chỉ là gạch đầu dòng.**
    - **Lỗi 1 (đã xác nhận):** `startGame()` nhánh `ruleSwap2`
      (`server/socket/handlers/GameHandler.js:576-605`) emit `game:init` với
      `timer: null`, không gọi `startTimerForGame()`. Suốt các phase
      `place3`/`p2choice`/`place2`/`p1choice`, `timerMap` không có entry cho
      phòng đó → không ai bị trừ giờ khi đặt quân mở màn / chọn bên.
    - **Lỗi 2 (đã xác nhận):** `TimerManager` constructor hard-code
      `this.activeColor = 'black'` (`server/managers/TimerManager.js:59`),
      đúng cho ván thường (Đen đi trước) nhưng sai cho Swap2 — luật Swap2 quy
      định **Trắng luôn đi trước** sau khi resolve
      (`GameEngine.js:380`, `_assignColors`). `startTimerForGame()` (gọi tại
      `GameHandler.js:158-159` khi `r.done`) không truyền `activeColor` khởi
      tạo theo `engine.currentTurn` thực tế → timer luôn bắt đầu trừ giờ Đen
      dù đang là lượt Trắng.
    - **Hướng sửa đã chốt:** dùng `firstPlayerId`/`secondPlayerId` (cố định
      suốt khai cuộc) làm nhãn placeholder cho 2 khe đếm `black`/`white` của
      `TimerManager` ngay từ lúc `startGame()` tạo engine Swap2, sau đó
      **remap** nhãn đó sang màu thật khi `_assignColors()` chạy (thêm
      method `remapForSwap2()` mới trên `TimerManager`, không đổi API cũ).
      Switch lượt trong lúc khai cuộc (`game:swap2_place`/`game:swap2_choice`
      handler) qua `timer.switchTurn()` mỗi khi `currentTurn` đổi người.
    - **Đụng tới cả client:** `renderSwap2()`
      (`client/js/game-ui.js`) hiện đang ẩn hẳn turn-bar
      (`setTurnBarVisible(false)`) — phải bật hiển thị + sửa
      `renderTimers()`/tên hiển thị để không dựa vào `player.color` (đang
      `null` lúc chưa gán màu), nếu không đồng hồ chạy đúng ở server nhưng
      người dùng không thấy gì. Bump `?v=N` (rule `CLAUDE.md`) vì đụng
      `client/js/game-ui.js`.
    - **Trạng thái:** đã triển khai đúng hướng đã chốt — xem chi tiết đầy đủ
      trong `docs/fix-log.md` (dòng `2026-08-04 09:52`).
    - **Test:** `server/tests/TimerManager.test.js` — 3 case cho
      `remapForSwap2()` (firstPlayer thật sự là Đen → không hoán đổi;
      firstPlayer hoá ra là Trắng → hoán đổi đúng `black`/`white` +
      `blackPlayerId`/`whitePlayerId`; field khác không bị đụng), mutation
      qua stash → cả 3 đỏ đúng dự kiến → khôi phục xanh lại. `npm test`
      368/368 xanh (was 365). Client-side vẫn chưa có Jest — mở rộng
      `e2e/swap2-opening.spec.ts` với assertion timer thật (turn-bar không
      ẩn, `timerValues.black` giảm thật qua 2.2s trong lúc khai cuộc, đúng
      bên WHITE được `turn-bar__active` sau khi resolve); chạy trên server
      thật ở cổng 3099 (không đụng server thật đang phục vụ Cloudflare
      Tunnel ở 3000). Mutation-check cả assertion e2e bằng stash 3 file sửa
      + restart server → đỏ đúng ngay tại assertion turn-bar ẩn, khớp lỗi
      báo cáo; khôi phục → xanh lại trên chromium.

### Nguồn: yêu cầu người dùng — redesign Start Modal & luồng ready/kết-thúc-ván (2026-08-04)

36. **Redesign Start Modal + bỏ Game-End Modal, đổi cơ chế đếm-trượt cho
    ready-window** — người dùng xem sơ đồ luồng "bắt đầu ván" hiện tại
    (mermaid) và đánh giá UX chưa tốt, tự đề xuất thiết kế mới, đã hỏi lại
    3 vòng làm rõ trực tiếp trước khi ghi mục này. **Đọc kỹ
    `instruction.md` §B36 trước khi làm — thiết kế khá tinh vi (máy trạng
    thái đếm-trượt 3 lần), tóm tắt ở đây chỉ là gạch đầu dòng.**
    - **Đổi thời điểm mở đếm ngược:** hiện tại cả 2 ngồi đủ ghế là tự động mở
      đếm ngược 30s (`syncReadyWindow`). Mới: đủ 2 ghế chỉ đứng yên chờ, đếm
      ngược **15s** chỉ mở khi **1 người bấm "Bắt đầu" trước**.
    - **Cơ chế 3 lần trượt:** hết 15s mà người còn lại chưa bấm → tính 1 lần
      trượt, quay lại chờ (không tự mở lại đếm ngược). Trượt đủ 3 lần → kick
      đúng người không bấm ở lần thứ 3, người kia được giữ ghế. Bất kỳ thay
      đổi tư cách ngồi nào ở 1 trong 2 ghế (đứng dậy/kick/rời phòng, kể cả
      giữa chừng 1 vòng đếm chưa hết hạn) → reset bộ đếm về 0, coi là cặp
      ghế mới.
    - **Modal nhỏ lại:** bỏ backdrop full-screen của `#start-modal`, định vị
      **giữa bàn cờ** thay vì che cả màn hình — người dùng vẫn bấm được nút
      đứng dậy trên ghế (`.slot-card__stand`, đã có sẵn) và dùng chat bình
      thường trong lúc modal hiện.
    - **Bỏ hẳn `#game-overlay`** (modal công bố Thắng/Thua/Hoà + nút "Đấu
      lại"/"Đóng") — không cần công bố thắng/thua vì bàn cờ đã tô nước thắng
      (`_drawWinHighlight`); case Hoà chỉ cần cải thiện toast/system-chat,
      không cần modal. Kết thúc ván = coi như "cặp ghế mới", chạy lại đúng
      luồng B36 từ đầu — **không còn phân biệt ván đầu tiên và rematch** (cố
      ý đảo ngược 1 ranh giới cũ từng ghi ở B35, xem lý do trong
      `instruction.md` §B36).
    - **Phạm vi đụng tới:** `server/socket/state.js` (`syncReadyWindow`,
      `handleReadyWindowTimeout`, `READY_WINDOW_MS`), `server/managers/
      RoomManager.js` (`forceUnreadyPlayersToStand`, cần state
      `readyMissCount` mới trên room), `server/socket/handlers/
      GameHandler.js` (`handleGameEnd`, bỏ `game:rematch` đặc biệt),
      `client/room.html` (`#start-modal` CSS + xoá `#game-overlay`),
      `client/js/room-ui.js` (`renderStartModal`, xoá `showGameOverlay`),
      `client/js/room.js` (xoá `btnRematch`/`btnCloseOverlay`, hoặc đổi mục
      đích). Nhớ bump `?v=N` (rule `CLAUDE.md`) vì đụng cả `client/css/` lẫn
      `client/js/`.
    - **Trạng thái:** chưa làm — mục này chỉ mới lên kế hoạch + ghi hướng
      dẫn thực thi, đang chờ triển khai.
    - **Test dự kiến:** server-side bắt buộc Jest cho máy trạng thái
      `readyMissCount` (3 nhánh: trượt 1-2 lần, trượt đủ 3 lần kick đúng
      người, reset khi đổi tư cách ngồi giữa chừng) theo rule "Bug-fix
      workflow" trong `CLAUDE.md`. Client-side dùng Playwright (`e2e/`,
      chưa có Jest client) — bắt buộc có 1 test xác nhận modal không chặn
      click nền (đứng dậy/chat được trong lúc modal hiện), vì đây là lý do
      chính của redesign.

---

<!-- Khi nhận báo cáo mới: thêm heading "### Nguồn: <tên báo cáo>" dưới đúng
     Phần A hoặc Phần B, giữ định dạng số thứ tự + đánh giá hiệu quả/an toàn +
     trạng thái test như trên. -->
