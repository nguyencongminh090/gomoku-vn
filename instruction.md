# Instruction — hướng dẫn cụ thể của reviewer cho từng việc trong TODO.md

Nguồn: `issue report.md` (review gốc 2026-08-01, commit `87006c5` + báo cáo kiểm
chứng bản sửa, commit `3da53dd`).

**Mục đích của file này:** `TODO.md` liệt kê *việc cần làm* + đánh giá của agent
(hiệu quả/an toàn/test). File này giữ lại *hướng dẫn thực thi* mà reviewer đã
viết kèm — cách làm đúng, cái bẫy cụ thể, và ranh giới không được đụng vào. Khi
làm một mục trong `TODO.md`, đọc đúng mục tương ứng ở đây trước khi code.

Đánh số dưới đây khớp với số thứ tự trong `TODO.md` (Phần A / Phần B).

---

## 0. Quy tắc chung áp dụng cho MỌI việc sửa (rút từ mục 8 - Phụ lục)

- **Assert trạng thái trước khi đo/kết luận, không suy diễn.** Ví dụ reviewer
  dùng: assert server khởi động với 0 phòng trước khi test chiếm phòng; assert
  đúng lượt ai trước khi đo race đồng hồ. Không assert được thì ghi rõ "CHƯA ĐO
  ĐƯỢC", không ghi số đoán chừng.
- **Hai con số phải tự khớp nhau.** Nếu lệch (vd. "9 phòng" trong khi lobby báo
  "10") thì đang đo sai trạng thái, không phải làm tròn cho khớp.
- **Không sửa file gốc để chạy mutation test.** Copy sang thư mục tạm, gỡ logic
  trên bản copy, chạy lại suite, so với baseline — xong thì xoá bản copy, **giữ
  lại test thật đã viết** (xem CLAUDE.md rule "Bug-fix workflow").
- **Rate limiter tự chặn probe của chính mình** (`authLimiter` 20 request/15
  phút/IP áp cho cả `/api/auth/guest`). Muốn test với nhiều "người dùng" hơn số
  đó phải restart server giữa các đợt — không tăng limit trong code production
  chỉ để test qua.

---

## Phần A (không sửa bằng code) — hướng dẫn khi triển khai thật

### A1. TLS/HTTPS (review 3.0)

- Caddy là lựa chọn rẻ nhất — tự xin và tự gia hạn Let's Encrypt, app không cần
  biết gì về chứng chỉ, vẫn nói HTTP trần ở cổng nội bộ.
- **Bắt buộc đi kèm:** `app.set('trust proxy', 'loopback');` (hoặc đúng số hop
  thật) trong `server/index.js`. Thiếu dòng này → `express-rate-limit` gộp mọi
  người dùng vào chung IP proxy, khoá nhầm người thật thay vì kẻ tấn công. Set
  **quá rộng** → `X-Forwarded-For` giả mạo được, bypass rate limit — phải set
  đúng số hop, không phải set rộng cho chắc.
- **Không được đụng vào:** `client/js/socket-client.js:40` gọi `io({...})`
  không truyền URL — socket.io tự chọn `wss://`/`ws://` theo origin trang, đây
  đã đúng sẵn. Không hardcode `ws://` ở đây.
- **Nếu dùng Caddy:** block `handle /socket.io*` phải đặt **trước** block
  catch-all, nếu không catch-all nuốt mất đường socket — lỗi hay gặp khi dựng
  lần đầu.

**✅ Đã xác nhận + sửa (2026-08-02):** deploy thật dùng Cloudflare Tunnel,
đúng 1 hop qua loopback — khớp chính xác gợi ý ở trên.
`app.set('trust proxy', 'loopback')` đã thêm vào `server/index.js` (sửa crash
`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` của `express-rate-limit`). Phát hiện
thêm lúc sửa: dòng đó **không** tự động sửa `socket.handshake.address` (dùng
cho quota `MAX_ROOMS_PER_IP`) — engine.io đọc thẳng
`req.connection.remoteAddress`, hoàn toàn tách biệt khỏi cấu hình `trust
proxy` của Express, nên phải thêm riêng `getClientIp()`
(`server/socket/state.js`) cùng logic loopback-only. Xem TODO.md #30,
`docs/fix-log.md`.

### A4. Đo lại timing attack sau khi áp Phần B #6

Sau khi thêm dummy-compare (Phần B #6), phải đo lại **thời gian phản hồi thật**
(không chỉ tính đối xứng code path) trên máy có bcrypt hoạt động được — máy
đánh giá gốc không load được bcrypt nên chưa có số đo trước/sau để so sánh.

### A6. Kiến trúc scale quá 1 tiến trình (từ stress test 2026-08-02)

- **Đừng bắt đầu việc này vì lý do hiệu năng.** Số đo hiện có: 2000 người chơi
  đồng thời / 1000 ván → CPU ~12% của **một** core, RSS ~200MB, không crash,
  không rò rỉ. Trần 1 core còn rất xa. Lý do chính đáng để làm là **HA / không
  chấp nhận mất ván khi restart**, không phải throughput.
- Nếu vẫn làm: `cluster` hay nhiều instance đều **không chạy được nếu chỉ thêm
  process** — state phòng đang nằm trong RAM tiến trình (`RoomManager.rooms`,
  và `sessions`/`timerMap`/`disconnectTimers`/`readyTimers` trong
  `server/socket/state.js`). Bắt buộc kèm đủ 3 thứ: sticky session ở proxy,
  adapter cho socket.io (`@socket.io/redis-adapter` hoặc tương đương), và đưa
  state phòng ra store ngoài. Làm thiếu một trong ba thì lỗi sẽ ra dưới dạng
  "người chơi cùng phòng rơi vào 2 instance khác nhau", rất khó lần.
- Đây cũng là lúc phải trả lời câu hỏi mà hiện tại đang ngầm chấp nhận: **mất
  tiến trình = mất mọi ván đang chơi**. Nếu điều đó vẫn chấp nhận được thì phần
  lớn công sức ở trên là không cần thiết.

### A7. Đo lại tải bằng harness đa tiến trình (từ stress test 2026-08-02)

- Vấn đề của số liệu hiện tại: script tạo tải và phần đo **chạy chung 1 tiến
  trình Node**, tự nó cũng đơn luồng và cũng đang bị dồn event loop ở mức 2000
  socket. Không tách được "server hết sức" với "script hết sức".
- Bằng chứng cụ thể cho việc chưa tin được: **cùng điều kiện (2000 người, cửa sổ
  15s) ra 15.2% lỗi khi chạy trong ramp nhưng 2.5% khi chạy riêng.** Ngưỡng thật
  không dao động kiểu đó.
- Cách làm đúng: tách tải ra nhiều tiến trình OS (hoặc máy thật thứ 2 qua LAN),
  mỗi tiến trình giữ một phần số socket, gom kết quả lại sau. Trước khi có việc
  này, **không được trích con số "2000 là ngưỡng"** ra ngoài — nó chưa được
  chứng minh là ngưỡng của server.

**✅ ĐÃ ĐO LẠI (2026-08-02), dùng đúng harness đa tiến trình vừa build ở B26**
(`scripts/capacity-test/`, server phụ raised-cap ở cổng 3099, đã tắt sau khi
xong — server thật ở 3000 không đụng tới):

- **Bắt được 1 bug thật trong chính harness trước khi tin số liệu**: `worker.js`
  ban đầu chạy các phòng được giao **tuần tự** trong 1 tiến trình (`for` +
  `await` từng phòng), nên `--workers=8` chỉ thật sự tạo ra ~8 phòng đồng thời
  bất kể `--rooms` là bao nhiêu — y hệt vấn đề đang muốn sửa. Đã sửa thành
  `Promise.all` toàn bộ phòng được giao cho 1 worker, xác nhận bằng thời gian
  chạy giảm đúng theo tỉ lệ (150 phòng: 100s tuần tự → 6.9s song song thật).
- **Kết quả sau khi sửa, tăng dần**: 100/300/400 người đều sạch, CPU thấp
  (3-4% của 1 core). Ở **2000 người chơi đồng thời (1000 ván) — đúng con số
  báo cáo cũ nghi ngờ**: **0 lỗi**, p95=75ms, p99=135ms, nhưng **CPU ~37% của
  một core** (so với 12% ghi nhận trước đây bằng harness đơn tiến trình bị
  confound — con số cũ thấp giả tạo vì bản thân script tạo tải cũng nghẽn).
  **3000 người**: vẫn sạch 100%, CPU ~31%, RSS ~273MB. **3200 người**: bắt đầu
  lác đác lỗi (6/1600 phòng, "connect timeout"). **3500+ người**: lỗi rõ rệt
  (13-18%), log server xuất hiện `Session ID unknown` — dấu hiệu kinh điển của
  việc handshake long-polling Engine.io va chạm khi có hàng nghìn kết nối MỚI
  cùng lúc trong vài trăm ms.
- **Phát hiện quan trọng: điểm gãy không phải CPU/RAM** — CPU đỉnh chỉ ~41%
  của 1 core, RSS ~271MB ngay tại điểm bắt đầu lỗi (3200-4000 người). Nút thắt
  nằm ở **bước bắt tay kết nối** (Engine.io polling→websocket) khi có hàng
  nghìn *kết nối mới* nổ ra đồng thời trong cùng một khoảnh khắc, không phải ở
  logic ván đấu hay bộ nhớ.
- **Giới hạn của phép đo này vẫn còn**: đây vẫn là burst nhân tạo — toàn bộ
  N người "connect cùng lúc" trong `Promise.all`, không phải traffic thật đến
  rải rác theo thời gian (traffic thật rải rác sẽ ít áp lực hơn nhiều lên bước
  handshake này, nên đây vẫn là "sàn bi quan" chứ không phải trần thực tế —
  đúng như đã ghi trong `docs/stress-test-report.md` §6).
- **Kết luận có thể trích dẫn**: với harness đa tiến trình thật (không còn bị
  confound bởi chính script đo), server chịu được **~3000 người chơi đồng
  thời sạch sẽ**, bắt đầu suy giảm ở **~3200-3500+** — và nguyên nhân là bước
  bắt tay kết nối dưới burst cực đoan, không phải CPU/RAM (vẫn còn rất nhiều
  dư địa ở cả hai). Số liệu tại `docs/stress-test-report.md` §9.

### A8. Quan sát heap/GC của server đang chạy (từ stress test 2026-08-02)

**Cập nhật: câu hỏi cụ thể "GC có gây đuôi p95/p99 không" đã trả lời được
(TODO.md #20) mà KHÔNG cần làm mục này** — chỉ cần khởi động lại server với cờ
`--inspect`-tương-đương là `--trace-gc` (flag chẩn đoán thuần, không phải code
mới, không cần endpoint debug hay APM), log ra timestamp + thời lượng từng lần
GC, đối chiếu với khung giờ chạy tải. Đủ để loại GC khỏi nghi phạm cho câu hỏi
đó. Phần dưới đây vẫn giữ nguyên cho lần sau nếu cần quan sát heap/GC **sâu
hơn** (vd. tìm leak dần theo thời gian, không chỉ "GC có pause dài lúc burst
không"):

- RSS lấy từ ngoài bằng `ps` **không** cho thấy heap used/limit — chỉ
  `--trace-gc`/`--inspect` mới thấy được từng lần GC cụ thể.
- 3 hướng, chọn theo mức độ sẵn sàng vận hành: chạy `--inspect` rồi lấy profile
  (rẻ nhất, chỉ dùng lúc đo), thêm endpoint debug trả `process.memoryUsage()`
  **và phải tắt ở production** (nếu chọn hướng này thì phần code rất nhỏ, nhưng
  nhớ nó là bề mặt tấn công mới), hoặc gắn APM thật.
- **Đừng import trực tiếp module server vào tiến trình đo** để đọc bộ nhớ — server
  là tiến trình OS riêng, làm vậy chỉ đo được bộ nhớ của chính script đo.

---

## Phần B (sửa bằng code) — hướng dẫn cho từng mục

### B1. Restart-hang else branch (review 5.1)

- Chỉ cần emit `room:destroyed`/`room:left` trong nhánh else — reviewer không
  yêu cầu logic phức tạp hơn (không cần lưu state phòng ra đĩa, không cần giữ
  ván qua restart — đó là thay đổi kiến trúc lớn hơn nhiều, ngoài phạm vi việc
  này).

### B2. Chat sanitize (review 3.5)

- Sửa: **escape thực thể** (`&lt;`, `&gt;`), không phải thêm rule regex khác để
  bắt thẻ không đóng — reviewer đánh giá cách vá đúng là đổi hẳn chiến lược
  (escape) chứ không phải vá thêm cho quy tắc "strip" cũ.
- Đây là phòng thủ chiều sâu — reviewer xác nhận **không có XSS đang mở** hôm
  nay (consumer dùng `textContent`). Không cần coi đây là khẩn cấp.

### B3. `escapeAttr` (review 3.7)

- Hiện **an toàn** vì input chỉ là `roomId`/`userId` do server sinh. Sửa vì
  phòng ngừa tương lai — reviewer cảnh báo cụ thể: nếu sau này ai tái dùng hàm
  này cho `roomName`/`displayName` (dữ liệu người dùng nhập) mà chưa sửa, lỗ
  hổng mới thành thật. Không cần gấp nhưng nên sửa trước khi `escapeAttr` được
  dùng cho input tự do.

### B4. `SELECT *` + rate limit `/api/games` (review 6.4)

- Không có hướng dẫn chi tiết thêm từ reviewer ngoài mô tả lỗi — 2 việc độc
  lập, có thể làm riêng.

### B6. Timing attack — dummy compare (review 3.6)

- Sửa: "luôn `compare` với một hash dummy **cố định**" — chú ý chữ "cố định":
  không tính dummy hash động (vd. hash rỗng runtime), phải là 1 hằng số
  hardcode, nếu không phép so sánh dummy có thể có timing khác biệt tuỳ theo
  cách sinh ra.
- Xem A4 — phải đo lại sau khi sửa.

### B7. Room quota theo IP/tài khoản (review 3.2)

- Reviewer đề 2 hướng, chọn 1: **(a)** hạn mức phòng theo IP/tài khoản, hoặc
  **(b)** cấm hẳn guest tạo phòng (chỉ cho join phòng có sẵn). Không bắt buộc
  làm cả hai.

### B8. Bỏ `settings` khỏi `room:updated` (review 4.2)

- Có **17 điểm emit** `room:updated` được reviewer liệt kê theo review 4.1 (số
  điểm gọi `broadcastLobbyUpdate` liên quan) — khi sửa, đối chiếu đủ danh sách
  gốc trong `issue report.md` mục 4.1/4.2, không chỉ sửa những chỗ tình cờ gặp
  khi grep.
- Xa hơn (không bắt buộc trong lượt sửa rẻ): delta kiểu "user X đổi slot" thay
  vì chỉ bỏ settings — reviewer liệt kê đây là bước xa hơn, không phải yêu cầu
  bắt buộc của "thắng nhanh nhất".

**✅ Bước "xa hơn" đã làm (2026-08-03)** — xem TODO.md #8 (cập nhật) và
`docs/fix-log.md`. Tái dùng đúng kỹ thuật diff-tại-lúc-phát của `lobby:patch`
(mục 9) thay vì nghĩ ra cơ chế mới — áp cho `users[]`/`scoreTable` của
`room:updated`. Bài học giữ lại cho lần sau nếu làm delta cho một broadcast
khác trong repo này:

- **Test guard "đếm đủ N điểm emit" phải cập nhật theo cùng nhịp với refactor
  call site, không phải viết lại từ đầu.** `RoomManager.test.js` đã có sẵn 1
  test quét source đếm đúng 17 điểm gọi `serializeRoomUpdate(` trực tiếp (từ
  lúc làm mục 8 bản đầu) — khi 17 điểm đó đổi sang gọi qua
  `broadcastRoomUpdate(io, ...)`, test cũ **tự động đỏ** (đúng, không phải
  regression) vì không còn khớp pattern cũ. Phải sửa lại chính test đó để
  quét đúng pattern mới, không phải xoá nó đi.
- **Mock `../state` wholesale ở các suite khác (`LobbyHandler.test.js`,
  `DisconnectHandler.test.js`) cũng phải thêm hàm mới vào mock**, nếu không
  gọi hàm thật undefined sẽ throw ngay khi handler chạy — lỗi này dễ nhầm là
  bug thật ("TypeError: X is not a function") nếu không nhớ có bao nhiêu chỗ
  mock `../state` toàn bộ module thay vì import lẻ.
- **Restart server dev trước khi tin bất kỳ kết quả e2e nào sau khi sửa code
  server-side.** Server không dùng `--watch`/nodemon trong lượt chạy thường,
  nên Node giữ module cũ trong bộ nhớ dù file trên đĩa đã đổi — trong khi
  client là static file, đọc lại mỗi request. Sửa cả 2 phía (như delta này)
  mà chỉ restart... không restart thì ra lỗi "phối hợp lệch" trông y hệt một
  regression thật (ví dụ: `#room-id-nav` trống trơn) nhưng thực ra là do phía
  server đang chạy code review cũ.
- **Chạy `e2e/*.spec.ts` dồn hết một lượt trên 1 tiến trình server sẽ đụng
  `MAX_ROOMS_PER_IP=3`** vì mọi Playwright browser context trên cùng máy test
  đều chung 1 IP loopback — đúng giới hạn đã ghi trong
  `scripts/capacity-test/README.md`, không phải bug. Cách xác nhận nhanh:
  chạy riêng đúng 1 file bị fail ngay sau khi restart server sạch — nếu xanh
  thì là quota, không phải regression. Muốn chạy an toàn cả bộ: theo từng
  nhóm nhỏ (≤3 phòng tạo mới) rồi restart giữa các nhóm.

### B9. `lobby:update` → delta (review 4.1/13 + báo cáo kiểm chứng `3da53dd`)

- Review gốc: "debounce 200-500ms là thắng nhanh nhất... Xa hơn là gửi delta 1
  phòng + `roomId`" — tức reviewer **coi debounce là bước tạm, không phải bước
  cuối.**
- **Báo cáo kiểm chứng đã đo lại và phát hiện debounce 300ms KHÔNG đạt mục tiêu**
  ở nhịp người chơi thật (~1200ms giữa hành động) — vẫn ra đúng 4 gói/10 759B
  như trước khi có debounce. Reviewer đề xuất cụ thể: **nâng cửa sổ lên 1-2
  giây** như một bản vá rẻ tạm thời, hoặc **làm nốt phần delta** — khi đó cửa
  sổ bao nhiêu không còn quan trọng. Không coi debounce 300ms hiện tại là "đã
  xong việc này".

### B10. `timer:tick` → `deadline` (review 4.3)

- Sửa: gửi `{deadline}` **1 lần/lượt**, client tự đếm ngược — reviewer không
  yêu cầu gửi kèm thời gian server để đồng bộ đồng hồ (đó là rủi ro agent tự
  thêm vào khi đánh giá an toàn, xem `TODO.md` B10, không phải yêu cầu gốc của
  reviewer — nhưng nên cân nhắc vì review không đo case lệch giờ client).

### B11. Viết lại test đã bị xoá cho 6 fix (phát hiện từ báo cáo kiểm chứng)

- Reviewer chỉ rõ: *"các test đó đã viết rồi - chỉ cần giữ lại thay vì xoá"* —
  nghĩa là khi làm lại, tra đúng mô tả "Bằng chứng" của từng fix trong
  `docs/fix-log.md` để tái tạo đúng kịch bản test đã chạy qua (không cần thiết
  kế lại từ đầu), rồi giữ trong `server/tests/` vĩnh viễn.
- 6 fix cần test: #2 (isGuest thật), #3 (`!noScore`), #4 (không resume khi đối
  thủ còn grace), #6 (chặn kick khi `interrupted`), #7 (flood: 1 warning/cửa sổ
  + disconnect khi tái phạm), #12 (debounce lobby).

### B12. Thứ tự trong `cancelDisconnectGrace` (phát hiện từ báo cáo kiểm chứng)

- Sửa: dời `disconnectTimers.delete()` xuống **sau** khi kiểm tra membership
  (dòng 181), không phải xoá logic delete — chỉ đổi thứ tự 2 khối code đã có
  sẵn.
- Reviewer ghi rõ đây là **latent bug, chưa khai thác được** (kick đã bị chặn
  khi `interrupted` bởi fix #6) — không cần coi là khẩn cấp, nhưng nên sửa dứt
  điểm vì rẻ.

### B18. Tạo phòng "flash" sang room.html rồi bị đá về lobby khi đụng quota IP (mục 7)

- Đây **không phải** lỗi ở quota (`MAX_ROOMS_PER_IP`, mục 7) — quota hoạt động
  đúng thiết kế. Vấn đề nằm ở `submitCreate()` (`client/js/lobby.js`, ~dòng
  406): điều hướng sang `room.html` **ngay khi bấm nút**, trước khi biết
  `room:create` thành công hay không. Nếu bị từ chối, người dùng thấy trang
  nhấp nháy sang `room.html` rồi ~1.5s sau tự động về lại `index.html`
  (`room-socket.js` xử lý `room:error`, dòng ~91-104) — dễ hiểu lầm là app bị
  lỗi/đứng thay vì "tạo phòng thất bại vì bạn còn phòng cũ chưa đóng".
- Hướng sửa gợi ý (chưa chốt, cần quyết định khi làm): chờ `room:create`
  emit-with-ack (hoặc lắng nghe `room:joined`/`room:error` trước khi điều
  hướng) rồi mới chuyển trang, thay vì điều hướng lạc quan trước. Cân nhắc
  giữ UX "một click là vào phòng" cho trường hợp thành công (đa số) — chỉ trì
  hoãn điều hướng đủ để bắt được lỗi tạo phòng, không phải chờ round-trip đầy
  đủ của toàn bộ `room:joined` payload nếu điều đó làm chậm cảm nhận rõ rệt.
- Kịch bản để test lại: tạo phòng → mời người khác vào → tự rời phòng (người
  kia không rời) → lặp lại đủ số lần chạm `MAX_ROOMS_PER_IP` (mặc định 3) →
  tạo phòng lần nữa. Đã có sẵn tái hiện tự động ở
  `e2e/leave-then-create-room.spec.ts` — chạy trước khi sửa để thấy đúng hành
  vi lỗi, chạy lại sau khi sửa để xác nhận không còn "flash" sang room.html
  khi bị từ chối (ví dụ: assert không còn đi qua URL `room.html` trong
  trường hợp quota đầy, hoặc assert toast hiện trước khi có bất kỳ điều
  hướng nào).
- Phần "danh sách phòng trong lobby không load lại sau khi bị đá về" trong
  báo cáo gốc **chưa tái hiện được** trong lần điều tra này (danh sách vẫn
  hiện đúng các phòng cũ). Đừng giả định phần này đã được giải quyết chỉ vì
  sửa xong phần flash — nếu người báo cáo còn gặp lại, cần thêm chi tiết cụ
  thể (ảnh chụp, log console/network lúc đó) trước khi tìm tiếp.

**✅ ĐÃ SỬA (2026-08-02) — xem TODO.md #18.** Hai hướng đã thử, chỉ giữ một:

1. **Hướng ack-trước-khi-điều-hướng (đã làm, sau đó revert)** — đúng gợi ý ở
   trên: `submitCreate()` emit `room:create` từ chính socket của trang lobby,
   chờ `room:joined`/`room:error` rồi mới điều hướng, không còn "flash" sang
   `room.html` nữa trong trường hợp thành công lẫn thất bại. **Nhưng** điều
   hướng trang (lobby → room.html) luôn ngắt socket cũ và trang mới phải mở
   socket mới — trong khoảng ngắt-tới-kết-nối-lại đó, phòng vừa tạo chỉ có
   đúng 1 người (chính người tạo), và `DisconnectHandler.handleDisconnect()`
   coi đây là "phòng rỗng" rồi **huỷ ngay lập tức**. Phải thêm 1 cơ chế grace
   period mới ở server (`emptyRoomGraceTimers`, tách biệt với
   `disconnectTimers` 60s có sẵn cho ván đang chơi) để né việc này. Đo dưới
   tải song song thật (nhiều Playwright worker cùng chạy, mô phỏng máy chậm):
   **grace 5s không đủ**, tăng lên **15s vẫn không đủ** — một số lần điều
   hướng thật sự mất hơn 15 giây dưới tải nặng. Kết luận: đây không phải vấn
   đề "chỉnh số cho đúng" mà là **giới hạn kiến trúc** — bất kỳ grace period
   hữu hạn nào cũng có thể bị phá vỡ bởi mạng/thiết bị đủ chậm, kể cả với
   người dùng thật (không chỉ máy test), và cái giá phải trả khi bị phá vỡ là
   **mất chính phòng người dùng vừa tạo**. Rủi ro này lớn hơn cái lợi của việc
   xoá hẳn flash, nên **đã revert toàn bộ phần server** (không còn
   `emptyRoomGraceTimers`/`cancelEmptyRoomGrace` trong `state.js`/
   `DisconnectHandler.js`/`SocketHandler.js`/`config.js`) và revert
   `submitCreate()`/`processRoomIntent()` về đúng kiến trúc điều hướng lạc
   quan ban đầu.
2. **Hướng giữ điều hướng lạc quan, chỉ sửa hiển thị (đã làm, đang dùng)** —
   không đổi gì ở server hay ở luồng emit `room:create`. Thêm
   `#room-entry-overlay` trong `client/room.html`, hiện **mặc định** (đặt sẵn
   class `visible` trong HTML, không cần JS bật) che toàn bộ khung phòng
   trống/chưa init ngay khi vừa sang `room.html`, đến khi `room:joined` thật
   sự tới thì `room-socket.js`'s `hideEntryOverlay()` mới ẩn đi. Nếu bị từ
   chối, overlay vẫn che nguyên (không ai thấy UI phòng trống/vỡ), toast lỗi
   (`.toast--error`, z-index 1200) hiện đè lên overlay (z-index 1100), rồi
   `room:error` handler đưa về `index.html` sau ~1.5s — đúng pattern đã dùng
   sẵn cho `room:kicked`/`room:destroyed` trong cùng file. Không thêm bất kỳ
   cơ chế server mới nào, không có bề mặt lỗi mới.
3. **Bài học giữ lại**: khi một hướng sửa UX đòi hỏi thêm state/timing mới ở
   server (ở đây là "giữ socket sống qua một lần điều hướng trang"), phải đo
   dưới tải/điều kiện xấu THẬT trước khi tin, không chỉ chạy 1 lần thấy xanh
   là đủ — đúng tinh thần "tái hiện → đo → mới sửa" đã áp dụng cho nhóm
   B19-B26 bên dưới, giờ áp dụng luôn cho cả nhóm B-thường.
4. **Test**: `e2e/leave-then-create-room.spec.ts` cập nhật theo hành vi cuối
   cùng (assert overlay hiện ngay + toast lỗi + bounce về lobby), chạy PASS ổn
   định kể cả dưới `--workers=6` chạy chung với 2 spec nặng khác (đúng điều
   kiện đã làm lộ lỗi của hướng 1). `npm test`: 289/289 xanh — không có test
   unit mới vì #18 cuối cùng không đụng code server.

**⚠️ Vòng 2 (2026-08-02, sau test thật trên `play3cr.dpdns.org`)**: hướng 2 ở
trên hoá ra chỉ che triệu chứng. Người dùng thật báo cáo **không tạo được
phòng nào**, log server xác nhận: mỗi lần tạo phòng, phòng bị huỷ ngay trong
cùng giây do `handleDisconnect()` — không phải hiếm dưới tải nặng như lần đo
trên localhost, mà là **mọi lần**, một mình, mạng thật. Người dùng xác nhận
trực tiếp nguyên nhân: chuyển trang lobby → room bị server xử lý y như một
lần ngắt kết nối thật, và bị lặp lại liên tục.

Sửa lại lần này bằng đúng cơ chế đã revert ở hướng 1 (`emptyRoomGraceTimers`),
nhưng **không** kèm theo phần ack-trước-khi-điều-hướng đã gây rủi ro trước đó:

- `EMPTY_ROOM_GRACE_MS` (`server/config.js`, mặc định 20s, override qua env
  `EMPTY_ROOM_GRACE_MS`). `DisconnectHandler.handleDisconnect()`: nếu người
  vừa ngắt kết nối là **thành viên duy nhất còn lại** trong phòng, không gọi
  `roomManager.leaveRoom()` ngay — gọi `startEmptyRoomGrace()`, giữ nguyên
  membership trong `RoomManager`, chỉ đặt 1 `setTimeout`. Hết giờ mới thật sự
  gọi `leaveRoom()` (qua `finalizeNormalLeave()`, dùng chung logic với đường
  disconnect thường để không lặp code).
- `SocketHandler.js`: mọi kết nối mới đều gọi
  `DisconnectHandler.cancelEmptyRoomGrace(user.userId)` **trước** khi chạy
  logic auto-rejoin sẵn có (`roomManager.getRoomByUser` → emit `room:joined`)
  — không cần đổi gì thêm, vì phòng chưa từng bị xoá khỏi `RoomManager` nên
  auto-rejoin tự nhiên tìm thấy và vào lại được.
- **Vì sao lần này khác lần trước dù cùng ý tưởng "grace period":**
  - Nút "Rời phòng" (`room:leave`, `RoomHandler.js`) hoàn toàn tách biệt khỏi
    `handleDisconnect()` — vẫn huỷ phòng ngay lập tức như cũ. Grace chỉ áp
    dụng cho đường disconnect **ngoài ý muốn** (điều hướng trang, mạng chập
    chờn), không bao giờ trì hoãn một lần rời phòng chủ động.
  - Không đổi `submitCreate()`/kiến trúc điều hướng lạc quan — không thêm
    "chờ ack trước khi chuyển trang" nên không tạo thêm cửa sổ ngắt-kết-nối
    mới nào so với hiện trạng đang chạy.
  - Lo ngại cũ ("bất kỳ timeout hữu hạn nào cũng có thể bị phá vỡ") vẫn đúng
    về lý thuyết, nhưng giờ có bằng chứng thật: **không có grace = hỏng 100%
    số lần**, có grace 20s = một cải thiện chắc chắn so với hiện trạng, không
    phải rủi ro cộng thêm vào một đường đang chạy tốt (vì đường đó *đang
    không* chạy tốt).
- **Test**: `server/tests/DisconnectHandler.test.js`, describe block mới
  "empty-room grace period" — 5 test (bắt đầu grace đúng lúc, cancel qua
  reconnect không gọi `leaveRoom`, hết hạn thì huỷ thật + cleanup timer/ready
  timer + broadcast lobby, disconnect lặp lại không chồng timer, cancel khi
  không có gì đang chờ trả `false`). Mutation-check: revert riêng
  `DisconnectHandler.js` → cả 5 fail → khôi phục → `npm test`: 294/294 xanh.
  Cũng phải sửa mock `DisconnectHandler` trong `SocketHandler.test.js` và
  `flood-protection.test.js` (thêm `cancelEmptyRoomGrace: jest.fn(() =>
  false)`) và mock room trong test "proceeds with normal leave..." (thêm
  `users` map 2 người, vì code mới đọc `room.users.size`).

### B19–B26. Nhóm phát hiện từ stress test (2026-08-02)

**Quy tắc chung cho cả nhóm này — đọc trước khi đụng bất kỳ mục nào:**

- Không mục nào trong B19–B26 là bug đã xác nhận. Đợt đo chỉ chứng minh được
  điều ngược lại (tới 2000 người chơi đồng thời: không crash, không treo, không
  rò rỉ, CPU ~12% một core). Đây là **danh sách nghi vấn để đi đo tiếp**, không
  phải danh sách việc phải sửa.
- Vì vậy thứ tự bắt buộc là **tái hiện → đo → mới sửa**. Sửa "phòng xa" theo suy
  đoán ở đây vi phạm đúng rule scope discipline trong `CLAUDE.md`, và tệ hơn là
  dễ tạo regression thật để đổi lấy một cải thiện tưởng tượng.
- Nhiều mục phụ thuộc Phần A #7 (harness đa tiến trình). Nếu chưa có nó, kết quả
  đo lại sẽ tiếp tục lẫn nhiễu của chính script đo — cân nhắc làm A7 trước.

**B19 (`game:init` chậm/không tới ở tải cao):**
**✅ ĐÃ ĐO (2026-08-02) — xem TODO.md #19.** Thay vì gắn log server-side (vốn là
gợi ý ban đầu), đo được đủ từ phía client bằng cách tách chuỗi bắt tay khỏi mọi
nước đi: chạy riêng 2000 người chỉ để hoàn tất bắt tay (không chơi), ra 0 lỗi,
độ trễ tối đa 122ms — quá xa cửa sổ 15s từng gây lỗi. Chạy lại đúng bản gốc (có
6 nước đi/cặp) trên server vừa khởi động lại thì giai đoạn bị timeout **đổi**
so với lần trước (lần này `room:joined`, lần trước `game:init`) — loại được
giả thuyết (c) race cụ thể trong `syncReadyWindow`/`startGame`. **Không cần
gắn log server-side nữa, không cần sửa gì ở 4 mốc đó.**

**B20 (p95/p99 vọt lên):**
**✅ ĐÃ ĐO PHẦN GC (2026-08-02) — xem TODO.md #20.** Chạy server với
`--trace-gc` (chỉ flag chẩn đoán, không phải code mới — tránh được việc phải
làm A8 trước) trong đúng kịch bản 2000 người gây p95/p99 cao, đối chiếu log GC
với khung giờ burst chạy thật: pause GC dài nhất trong khung đó chỉ 3.92ms,
tổng GC dồn lại 98.26ms/19 giây. **Loại được GC khỏi danh sách nghi phạm.**
Đuôi latency nhiều khả năng cùng gốc với B19 (cộng dồn lưu lượng trong harness)
— xem thêm B22 cho phần fan-out.

**B21 (số timer theo số phòng):**
**✅ ĐÃ ĐO (2026-08-02) — xem TODO.md #21.** Dựng 784 ván sống song song rồi để
im hoàn toàn (0 traffic) 12 giây, đo CPU: chỉ tăng 1.3-1.5 điểm % so với
baseline, phẳng suốt 12 giây. **Xác nhận: đừng gộp interval — chưa có lý do
cần, và đây là thay đổi đụng đường đồng hồ ván đang chơi, rủi ro regression
cao hơn hẳn lợi ích chưa chứng minh** (giữ nguyên cảnh báo gốc, vì hướng gộp
interval hoá ra không cần thiết chứ không phải vì nó nguy hiểm).

**B22 (fan-out broadcast):**
**✅ ĐÃ ĐO (2026-08-02) — xem TODO.md #22.** So sánh cùng 1000 kết nối chia
theo 2 cách (500×2 người vs 50×20 người đầy đủ). Kết quả tách làm 2 nửa:
**giai đoạn ổn định (đang trao đổi nước đi) không có chi phí fan-out đáng kể**
— khán giả và người chơi chính nhận broadcast gần như cùng lúc, vì
`io.to(roomId).emit()` là 1 lệnh đồng bộ quét hết phòng trong 1 tick.
**Nhưng giai đoạn LẤP ĐẦY phòng (nhiều khán giả join dồn dập) có chi phí thật**
— mỗi `room:join` phát `room:updated` tới toàn bộ thành viên hiện có, nên 18
khán giả join gần như cùng lúc tạo ra chi phí broadcast tăng kiểu bậc hai chỉ
riêng cho giai đoạn đó, khớp với đuôi p95/p99 cao hơn hẳn quan sát được ở kịch
bản phòng đầy. **Nếu sau này cần tối ưu:** hướng đúng là debounce/gộp
`room:updated` trong giai đoạn nhiều người join gần nhau — cùng ý tưởng đã áp
dụng cho `lobby:update` ở TODO #9 — nhưng **chưa đủ lý do làm ngay**, vì "18
khán giả join cùng lúc trong <1s" hiếm khi xảy ra ngoài môi trường test tải.
để dựng phòng đầy, nhưng bằng socket thô chứ không phải 20 browser context.

**B23 (`better-sqlite3` đồng bộ + `bcrypt` chặn event loop):**
**✅ ĐÃ ĐO (2026-08-02) — không thấy ảnh hưởng ở quy mô đã test, xem TODO.md #23.**
100 ván thật (200 người) chạy nền, bắn 14 lệnh `POST /api/auth/register` thật
đồng thời giữa chừng: độ trễ nước đi không đổi (p50=1ms cả trước/trong/sau).
Request đăng ký tự nó chậm (p50=517ms — threadpool libuv chỉ 4 luồng, 14 request
tranh nhau) nhưng **không lan sang** người đang chơi, vì `bcrypt.hash()` dùng
bản Promise chạy trên threadpool chứ không chặn main thread; 2 câu SQLite đồng
bộ còn lại đủ nhanh ở DB nhỏ. **Đừng hạ `BCRYPT_ROUNDS` hay đổi gì** — chưa có
bằng chứng cần. Nếu sau này nghi ngờ lại (DB đã lớn, hoặc burst đăng ký >20
request — vượt `authLimiter`), đo lại đúng kịch bản này trước khi kết luận
khác đi; đừng dựa mãi vào kết quả ở DB gần-rỗng.

**B24 (flood protection báo nhầm):**
**✅ ĐÃ LÀM (2026-08-02) — xem TODO.md #24.** Làm chung với TEST-MATRIX row 23
đúng như gợi ý ban đầu, ra thành test thật `e2e/flood-protection.spec.ts` (2
case, không phải script tạm trong scratchpad — vì test này rẻ, ~7-8s mỗi lần,
không cần nâng cap gì nên an toàn để giữ lại trong suite thường xuyên, khác
hẳn bench row 35). 300 socket đồng thời ở 40 event/s/socket (dưới ngưỡng 50,
tổng 12 000 event/s) → 0 báo nhầm, 0 ngắt oan; đo tay thêm ở 500 socket ×
45/s (sát ngưỡng hơn) cũng 0 báo nhầm. Thiết kế đếm bằng closure riêng từng
socket (không có bộ đếm dùng chung) đã được xác nhận là an toàn dưới tải tổng
cao — **không cần sửa gì.**
**Lưu ý:** sau đó cùng ngày, chạy lại spec này ngay sau phiên B19-B22 (784+
ván trên cùng 1 server process) ra 1 lần fail (ngắt oan); restart sạch rồi
chạy 10 lần liên tiếp đều xanh. Xem TODO.md #24 mục "Lưu ý trung thực" — nếu
spec này fail lại, kiểm tra server có vừa xử lý tải nặng khác không trước khi
coi là flaky.

**B25 (đường từ chối ở cap thật):**
**✅ ĐÃ ĐO (2026-08-02), không thấy lỗi — xem TODO.md #25.** Chạy đúng ở cap
production, không nâng gì: 15 `room:create` đồng thời cùng IP → đúng 3 thành
công + 12 từ chối sạch + 1 lệnh tạo tiếp sau burst vẫn bị từ chối đúng (quota
không lệch); 40 `room:join` đồng thời vào 1 phòng → đúng 19 thành công (=
`MAX_USERS_PER_ROOM - 1`) + 21 từ chối sạch. 0 timeout, 0 rơi gói im lặng ở cả
2 case. **Không cần làm gì thêm cho mục này** trừ khi có báo cáo cụ thể mới.

**B26 (harness thành test lâu dài):** chỉ làm khi đã chốt là **cần đo định kỳ**.
Nếu chỉ đo một lần rồi thôi thì script tạm là đủ và không nên nợ thêm một bộ test
nữa phải bảo trì. Nếu làm: đa tiến trình (A7), nhịp nước đi gần người thật (hiện
nén còn 400ms/nước — không phải nhịp người), và ngưỡng pass/fail rõ ràng thay vì
chỉ in số. Đặt ở đâu cũng được **trừ** `e2e/*.spec.ts` chạy trong lần chạy suite
thông thường — nó là test phá hoại tài nguyên, không nên chạy lẫn với suite chức
năng.
**✅ ĐÃ LÀM (2026-08-02) — xem TODO.md #26.** `scripts/capacity-test/` (không
dưới `e2e/`): `orchestrator.js` fork nhiều tiến trình OS thật qua
`child_process.fork` (không phải 1 event loop giả lập), `worker.js` chơi
từng ván với độ trễ mỗi nước ngẫu nhiên (mặc định 1200-3500ms, chỉnh được qua
`--moveDelayMinMs/MaxMs`), và có ngưỡng pass/fail thật (tỉ lệ tạo phòng tối
thiểu + p95 độ trễ tối đa + 0 lỗi) thay vì chỉ in số ra màn hình.
Thêm env-var override cho `MAX_ROOMS`/`MAX_ROOMS_PER_IP`/`MAX_USERS_PER_ROOM`
trong `server/config.js` (mặc định không đổi) để đổi tải khi cần mà không phải
sửa-rồi-`git checkout` file đã track mỗi lần như cách làm ở B19-B25.
Hai lỗi bắt được lúc chạy thử, đã sửa trước khi coi là xong: (1) chỉ đợi event
thành công mà không đua với `room:error`/`game:error` nên bị từ chối quota lại
báo nhầm thành "timeout" — sửa bằng `raceSuccess()` đợi cả hai; (2) đóng socket
thô không phát `room:leave` nên phòng bị giữ qua `DISCONNECT_GRACE_MS` (60s)
trước khi nhả quota, làm 2 lần chạy liên tiếp trên cùng máy đo sai — sửa bằng
phát `room:leave` (đợi ack `room:left`) trước khi đóng. Xem
`scripts/capacity-test/README.md` mục cảnh báo `MAX_ROOMS_PER_IP` cho việc chạy
nhiều tiến trình cùng 1 máy chia sẻ 1 IP (khớp phát hiện B25, không phải bug
harness).

**Ranh giới chung cho cả nhóm:** khi cần nâng cap để đo (như B22 có thể cần),
nâng tạm rồi **trả lại bằng `git checkout` ngay trong cùng phiên**, và ghi rõ
trong báo cáo là số đo đó lấy ở cap đã nâng — đúng cách đã làm ở
`docs/stress-test-report.md`. Không commit giá trị cap đã nâng, kể cả tạm.

### B28 (thứ tự transport — xem TODO.md #28)

Quyết định "áp dụng hay không" phụ thuộc **mốc tải nào đang được so sánh**,
không phải một câu trả lời cố định: ở 4000 người 2 thứ tự transport đo ra y
hệt nhau (backlog fix đã đủ), nhưng ở 6000 người thì tách biệt rõ (~15 điểm %).
Nếu review lại quyết định này sau này, đo ở đúng mốc tải team đang quan tâm
tại thời điểm đó — đừng tái dùng số đo ở 4000 để kết luận cho tải cao hơn.
Rủi ro tương thích proxy (client sau proxy chặn WebSocket) vẫn **chưa** đo
được trực tiếp trong cả 2 lần xem xét mục này (không có client thật sau proxy
chặn WebSocket) — quyết định áp dụng dựa trên `tryAllTransports` giới hạn cái
giá của rủi ro đó (chậm thêm 1 lần thử, không mất kết nối), không phải trên
bằng chứng đo được rằng rủi ro đó không xảy ra.

### B29 (trần >6000 người, phiên điều tra tiếp — xem TODO.md #29)

Bài học phương pháp cho lần đo tiếp theo nếu mục này còn mở:

- **`ps`'s `%CPU` là trung bình trượt, không phải tức thời** — lần đo gốc lấy
  mẫu 1 lần/giây bằng `ps` và kết luận CPU chỉ ~26%, "không phải nghẽn". Lần
  đo lại dùng `/proc/PID/stat` (utime+stime) lấy delta thật giữa 2 mốc, 5
  mẫu/giây, và thấy CPU thật vọt tới 100-190% đúng trong khung burst — `ps`
  đã che mất đỉnh ngắn. **Nếu cần kết luận "CPU có phải nghẽn không" cho một
  burst ngắn, đừng dùng `ps` lấy mẫu thưa — dùng delta `/proc/PID/stat` (hoặc
  `pidstat` với interval nhỏ) trong đúng khung burst.**
- **Cách loại trừ nghi phạm bằng thực nghiệm, không chỉ profiling:** để
  loại `jwt.verify`, không chỉ nhìn profile mà còn chạy lại đúng kịch bản với
  `jwt.verify` bị monkey-patch thành no-op (`node --require <preload>`, không
  đụng file gốc — preload thay `jwt.verify` trên module cache dùng chung,
  không cần sửa `server/middleware/auth.js`). Nếu số liệu không đổi → loại
  trừ được thật, không phải suy đoán từ "hàm này có vẻ nhẹ".
- **`--cpu-prof` là cách rẻ nhất để tìm hot path thật** — `node --cpu-prof
  --cpu-prof-dir=<dir> server/index.js`, chạy burst, gửi `SIGINT` để flush
  file `.cpuprofile`, rồi cộng dồn `timeDeltas` theo `samples`/`nodes` (script
  Node ngắn, xem cách làm trong `docs/fix-log.md` mục 2026-08-02 22:41) để ra
  bảng self-time theo hàm — không cần công cụ ngoài (clinic.js, --prof + tick
  processor) cho một lần khoanh vùng nhanh.
- **Xác nhận nhân-quả trước khi tin một dòng trong profile là nguyên nhân**:
  self-time cao trong profile chỉ là tương quan. Tắt tạm đoạn code nghi ngờ
  (bản nháp, không commit — đúng rule chung #0 "copy sang thư mục tạm"), chạy
  lại đúng kịch bản, so tỉ lệ thành công trước/sau. Chỉ khi số cải thiện thật
  mới coi là xác nhận, mới đi sửa thật.
- **Tìm được, đã sửa:** `lobby:online_users` broadcast (`SocketHandler.js`)
  chạy O(n) mỗi lần *một* connect/disconnect, n lần trong 1 burst n người =
  O(n²) — sửa bằng debounce cùng pattern `broadcastLobbyUpdate()` đã có.
- **Chưa isolate xong, đừng giả định đã đóng:** `saveGame()`'s SQLite
  transaction đồng bộ (~10% self-time trong profile) — nhưng đây là hệ quả
  hình dạng workload của chính harness (mọi phòng test kết thúc bằng
  `room:leave` giữa ván, bị coi là đầu hàng), **chưa** có bằng chứng đây là
  chi phí xảy ra ở traffic thật (nơi phần lớn ván kết thúc rải rác theo thời
  gian, không dồn cục trong 1 burst). Nếu đo tiếp: cần một kịch bản có nhiều
  ván **kết thúc tự nhiên** (hết nước/thắng thật) dồn trong 1 khung giờ ngắn,
  không phải suy diễn từ hành vi `room:leave` giữa ván của harness.

### B32. Giới hạn ký tự cho `displayName` (từ security review toàn bộ codebase, 2026-08-03)

- Đây là phòng thủ chiều sâu — audit xác nhận **không có XSS đang mở** hôm
  nay (mọi điểm render client dùng `escapeHtml`/`escapeAttr`/`escapeJsString`
  đúng cách trước khi chèn `innerHTML`). Không cần coi đây là khẩn cấp, cùng
  tinh thần với B2/B3 ở trên.
- **Ràng buộc quan trọng nhất khi chọn regex:** `displayName` hiển thị tên
  người dùng thật, bao gồm tên tiếng Việt có dấu (Unicode, vd. "Nguyễn Văn
  A"). Regex kiểu `[a-zA-Z0-9 ]+` sẽ **chặn nhầm** phần lớn tên thật của
  người dùng Việt — đây không phải giả thuyết, mà là rủi ro cụ thể do đối
  tượng người dùng của app này. Nếu làm, phải dùng class ký tự Unicode-aware
  (vd. chặn theo danh sách đen `<>&"'` + control character, thay vì chỉ cho
  qua allow-list ASCII) — không chọn hướng allow-list hẹp rồi phát hiện sau
  khi người dùng thật báo lỗi không đặt được tên.
- Không cần thêm gì ở phía escape hiện có (`escapeHtml` v.v. giữ nguyên,
  không phải thay thế) — đây là lớp chặn bổ sung ở nguồn, không phải thay
  cho lớp escape ở đích.
- Test: theo rule "Bug-fix workflow" trong `CLAUDE.md` — viết unit test cho
  `isValidDisplayName` (đã có coverage qua Jest ở `server/tests/`), cover cả
  case reject (`<script>`, control character) và case accept (tên tiếng Việt
  có dấu, khoảng trắng giữa tên) để tránh chính regression "chặn nhầm tên
  thật" nêu trên.

### B33. Kiểm tra tư cách người chơi khi chấp nhận/từ chối đề nghị hoà (từ recheck security review, 2026-08-03)

- Đây là bug thật đang mở, không phải phòng thủ chiều sâu như B32 — đã xác
  nhận CONFIRMED qua vòng lọc false-positive độc lập (confidence 9/10), có
  đường khai thác cụ thể bởi khán giả (bên thứ ba không có ghế), không phải
  suy đoán lý thuyết.
- **Sửa đúng bằng cách tái dùng pattern có sẵn trong cùng file** — không cần
  thiết kế mới: `resign()` và `offerDraw()` (`server/managers/GameEngine.js`,
  cùng file) đã có đúng dòng kiểm tra
  `const player = this.players.find(p => p.userId === userId); if (!player) return { error: 'Bạn không phải người chơi.' };`
  Copy đúng logic đó vào đầu `acceptDraw(userId)` và `declineDraw(userId)`,
  trước dòng kiểm `drawOffer.from`.
- **Không đụng vào handler socket** (`GameHandler.js` `game:draw_accept`/
  `game:draw_decline`) — kiểm tra nên đặt ở tầng `GameEngine` (nguồn sự thật
  của trạng thái ván), không phải tầng handler, để bất kỳ lối gọi nào khác
  tới `acceptDraw`/`declineDraw` trong tương lai cũng được bảo vệ, không chỉ
  lối gọi qua socket hiện tại.
- **Không đổi thông báo lỗi `'Bạn không phải người chơi.'`** — đây là chuỗi
  đã dùng sẵn cho `resign`/`offerDraw`, giữ nguyên để nhất quán UX, không bịa
  thông báo mới.
- Test: theo rule "Bug-fix workflow" — thêm case vào file test hiện có của
  `GameEngine` (nếu có) hoặc file mới, dựng đúng kịch bản: 1 người chơi + 1
  "khán giả" (userId không nằm trong `players`) gọi `acceptDraw`/
  `declineDraw`, assert bị từ chối với đúng lỗi trên và ván **không** kết
  thúc/không đổi `drawOffer`. Mutation-check: gỡ dòng kiểm tra mới, xác nhận
  test đỏ.

### B34. Kiểm tra tư cách người chơi khi chấp nhận/từ chối yêu cầu cộng giờ (từ recheck security review, 2026-08-03)

- Cùng đợt recheck với B33, cùng mức độ nghiêm trọng (CONFIRMED, confidence
  8/10) — khán giả trong phòng có thể cấp giờ không giới hạn cho một người
  chơi thay đối thủ thật, vô hiệu hoá cơ chế chống câu giờ.
- **Sửa đúng bằng cách tái dùng pattern có sẵn ngay trong cùng file** —
  `game:request_time` (`server/socket/handlers/GameHandler.js`, ~dòng
  281-285) đã có đúng kiểm tra
  `engine.players.find(p => p.userId === user.userId)`. Copy đúng kiểm tra
  đó vào đầu `game:time_accept` (~dòng 335) và `game:time_decline`
  (~dòng 372), trước logic kiểm `room._timeRequestPending.from`.
- **Khác B33 ở chỗ:** đây nằm ở tầng handler (`GameHandler.js`), không phải
  tầng `GameEngine` — vì `_timeRequestPending` là state của `room`, không
  phải state của `GameEngine`; giữ nguyên vị trí kiểm tra ở handler cho nhất
  quán với `game:request_time` đã có, không chuyển state này vào
  `GameEngine` chỉ để làm cho giống B33.
- Không đổi tên sự kiện lỗi (`game:error`) hay format `{ message }` — dùng
  đúng convention đang có ở `game:request_time` khi từ chối.
- Test: thêm case vào file test của `GameHandler`/socket handlers hiện có,
  dựng kịch bản: 1 "khán giả" (không nằm trong `engine.players`) phát
  `game:time_accept`/`game:time_decline` khi có `_timeRequestPending` đang
  chờ, assert bị từ chối và **không** cộng giờ / không xoá pending request.
  Mutation-check: gỡ kiểm tra mới, xác nhận test đỏ.

### B35. `#start-modal` chồng hình lên `#game-overlay` (từ báo cáo người dùng, 2026-08-03)

- **Tái hiện trước, đừng sửa theo suy đoán** — giả thuyết nguyên nhân gốc ở
  `TODO.md` #35 đọc từ code, chưa chạy Playwright xác nhận. Viết kịch bản
  2 trang (2 người chơi thật, không phải 1 trang giả lập 2 người) chơi hết 1
  ván, sau đó **chỉ 1 trong 2** bấm "Đấu lại" (`#btn-rematch`), chụp lại
  trạng thái DOM của trang còn lại — xác nhận đúng cả `#start-modal` và
  `#game-overlay` cùng có class `.visible` tại cùng 1 thời điểm trước khi
  chọn hướng sửa.
- **Việc phụ cần làm trước, không bỏ qua:** đối chiếu comment ở
  `server/socket/state.js:342` ("Called after every mutation that can affect
  it (sit, stand, kick, leave, settings change, confirmStart, **game
  end**)") với thực tế `handleGameEnd` (`server/socket/handlers/
  GameHandler.js:640`) — hàm này **không** gọi `syncReadyWindow`. Cần xác
  định đây là tài liệu lỗi thời (hành vi đúng, comment sai) hay đúng là thiếu
  1 lệnh gọi (bug khác, độc lập với B35) — không tự ý sửa `handleGameEnd` chỉ
  vì thấy comment không khớp, vì có thể comment mới là cái cần sửa.
- **Hướng sửa gợi ý (chưa chốt, chọn sau khi tái hiện xong):**
  - (a) Rẻ nhất, chỉ sửa hiển thị: trong `renderStartModal()`
    (`client/js/room-ui.js:202`), thêm điều kiện không hiện nếu
    `#game-overlay` đang có class `.visible` (kiểm tra DOM trực tiếp, hoặc
    thêm 1 cờ state `st.gameOverlayVisible` được set/gỡ đúng lúc trong
    `showGameOverlay()`/khi bấm "Đóng"/"Đấu lại").
  - (b) Đúng gốc hơn: không cho `readyDeadline` được set trong lúc
    `#game-overlay` còn đang chờ người dùng đóng — tức chặn từ phía server
    (trong `syncReadyWindow`) hoặc trì hoãn tới khi cả 2 phía đã dismiss
    overlay. Rủi ro cao hơn (a) vì đụng luồng ready-window dùng chung cho cả
    lượt chơi đầu tiên (không chỉ rematch).
  - **Khuyến nghị chọn (a) trước** — cùng tinh thần "sửa ở lớp hiển thị,
    không đụng state server" đã áp dụng cho mục 18 hướng 2 (overlay che UI
    vỡ) — trừ khi tái hiện cho thấy (a) không đủ.
- **Không đụng:** luồng `confirmStart`/`syncReadyWindow` cho lượt chơi ván
  ĐẦU TIÊN của phòng (trước khi có `game:ended` nào) — đó là hành vi đúng,
  không phải nguồn gốc bug này.
- Test: theo rule "Bug-fix workflow" — nếu chọn hướng (a), thêm test đơn vị
  cho phần logic thuần (nếu tách được hàm quyết định visible ra khỏi DOM) hoặc
  test bằng Playwright dựng đúng kịch bản 2 trang ở trên (client-side hiện
  chưa có unit test framework, ghi rõ theo đúng luật CLAUDE.md nếu không tách
  được phần thuần để test qua Jest).

**✅ ĐÃ SỬA (2026-08-03) — xem TODO.md #35.** Tái hiện xong bằng Playwright
trước khi sửa (đúng yêu cầu ở trên) — xác nhận cả `#start-modal` và
`#game-overlay` cùng `.visible` khi 1 người bấm "Đấu lại" trước người kia.

**Đã đổi hướng so với gợi ý ban đầu, sau khi thảo luận trực tiếp với người
dùng** — không chỉ chọn (a) hay (b) như liệt kê ở trên, mà đổi luôn mô hình:
Start Modal chỉ còn kích hoạt bởi đúng 1 sự kiện — "tôi vừa ngồi vào chỗ"
(ngồi lần đầu, hoặc đứng dậy rồi ngồi lại) — thay vì suy ra từ
`readyDeadline` gián tiếp qua broadcast. Cụ thể:
- Bấm "Đóng" (`btnCloseOverlay`, `client/js/room.js`) giờ **đứng dậy thật**
  (`room:stand`) thay vì chỉ ẩn overlay — người dùng đề xuất ý này, lý do
  chọn: xoá hẳn trạng thái lửng lơ "còn ngồi, chưa ready, không có hạn" mà
  bug này dựa vào, không chỉ che triệu chứng ở tầng hiển thị. Không cần tạo
  event mới — tái dùng đúng `roomManager.standUp()` đã có.
- **Vẫn giữ (a) làm phòng thủ chiều sâu**, không thay thế: `renderStartModal()`
  vẫn gate thêm bằng `#game-overlay` có `.visible` hay không, đề phòng đường
  khác (không phải rematch) cũng có thể set `readyDeadline` sớm mà chưa
  lường hết.
- Việc phụ (comment ở `state.js:342` không khớp `handleGameEnd`) đã xem lại
  — **không sửa**, vì hướng sửa trên loại bỏ triệu chứng mà không cần
  `handleGameEnd` tự gọi `syncReadyWindow`; không có bằng chứng cụ thể nào
  khác đang phụ thuộc vào đúng câu chữ của comment đó để buộc phải sửa theo.
- Test: `e2e/rematch-overlay-conflict.spec.ts` (Playwright, đúng kịch bản 2
  trang ở trên) — client vẫn chưa có unit test framework nên đây là guard
  duy nhất, đúng như dự đoán ở trên. Mutation-check: revert tạm 2 đoạn sửa
  trên bản copy → đỏ đúng dòng assert bắt bug; khôi phục → xanh.

### B36. Redesign Start Modal + bỏ Game-End Modal (từ yêu cầu người dùng, 2026-08-04)

**Nguồn:** không phải từ review bên ngoài — người dùng tự đề xuất sau khi được
xem sơ đồ luồng "bắt đầu ván" hiện tại (mermaid), muốn nâng UX. Đã hỏi lại
3 vòng làm rõ trực tiếp với người dùng trước khi ghi mục này — **coi các
quyết định dưới đây là đã chốt**, không phải gợi ý còn mở như các mục khác.

**Đổi mô hình cốt lõi — đọc kỹ trước khi code, đây là điểm dễ làm sai nhất:**
hiện tại `syncReadyWindow` (`server/socket/state.js:353-367`) tự động mở
`readyDeadline` 30s **ngay khi `bothSeated`** (không cần ai bấm gì). Mô hình
mới: `bothSeated` **không** tự mở đếm ngược — chỉ khi có **1 trong 2 người
bấm "Bắt đầu" trước** (`room:ready`) thì mới mở đếm ngược **15s**. Đây là lý
do không thể chỉ đổi hằng số `READY_WINDOW_MS` 30000→15000 mà xong — phải đổi
cả *thời điểm* đếm ngược được kích hoạt.

**Cơ chế đếm-trượt (đã người dùng giải thích kỹ bằng ví dụ, chép nguyên văn
logic vì đây là phần dễ hiểu sai nhất):**
- `room.readyMissCount` (0-3), tính theo **cặp ghế hiện tại** (2 người đang
  ngồi ở slot 1 + slot 2 lúc này), không phải theo user cụ thể.
- 1 người bấm "Bắt đầu" → mở đếm 15s. Hết 15s mà người còn lại **chưa bấm** →
  đây là **1 lần trượt** (`readyMissCount += 1`), quay lại trạng thái chờ
  ban đầu (không đếm ngược, cả 2 lại thấy nút "Bắt đầu", **không tự động mở
  lại đếm ngược** — phải có người bấm lại). Lặp lại tối đa 3 lần trượt.
- Tới lần trượt thứ 3: kick **đúng người không bấm ở vòng thứ 3 đó** ra khỏi
  ghế (không phải cả 2, không phải theo lịch sử ai từng trượt bao nhiêu lần —
  chỉ nhìn vòng cuối cùng). Người đã bấm được giữ nguyên ghế, chờ người mới.
- **`readyMissCount` reset về 0 khi có bất kỳ thay đổi tư cách ngồi nào** ở
  1 trong 2 ghế đang tính — đứng dậy chủ động (`room:stand`), bị kick (đủ 3
  lần trượt), hoặc rời phòng — **kể cả khi đang giữa chừng 1 vòng đếm 15s
  chưa hết hạn** (ví dụ người dùng cho: bấm Bắt đầu, 5s sau người kia đứng
  dậy giữa chừng — không tính là 1 lần trượt vì chưa hết 15s, chỉ đơn giản
  huỷ vòng đang chạy). Ghế trống được ngồi lại (bất kỳ ai, không cần đúng
  người cũ) → coi là cặp ghế mới hoàn toàn, quay lại baseline (không đếm
  ngược, chờ 1 người bấm), `readyMissCount = 0`.
- Nếu không ai bấm gì cả (im lặng hoàn toàn, cả 2 ghế đầy) → không có gì hết
  hạn, không kick, chờ vô thời hạn — đúng hành vi "chờ" hiện tại, chỉ khác là
  giờ áp dụng cả khi đã đủ 2 ghế (trước đây đủ 2 ghế là tự đếm ngược ngay).

**Modal nhỏ lại, không chặn thao tác khác:**
- Bỏ backdrop full-screen của `#start-modal` (`client/room.html:155-166`,
  hiện là `class="game-overlay"` = `position:fixed; inset:0` chặn hết click
  phía dưới). **Vị trí mới: giữa bàn cờ** (center của board container, không
  phải center viewport) — người dùng chốt rõ "Center the popup at middle
  board", không phải góc màn hình.
- Chỉ có **card** của modal nhận click; phần nền xung quanh phải
  `pointer-events: none` (hoặc bỏ hẳn lớp backdrop, chỉ còn 1 div định vị
  tuyệt đối) để nút đứng dậy `.slot-card__stand` (`client/js/room-ui.js:
  129-131`, đã tồn tại sẵn, điều kiện hiện tại `state !== 'playing'` **không
  đổi**) và khung chat dùng được bình thường trong lúc modal đang hiện.
- Vì nút đứng dậy đã có sẵn trên thẻ ghế, **không cần thêm nút "Đóng" riêng
  trong modal nhỏ này** — người dùng xác nhận không cần.

**Bỏ hẳn `#game-overlay` (modal công bố Thắng/Thua/Hoà):**
- Xoá `#game-overlay` khỏi `client/room.html:169-181`, hàm
  `showGameOverlay()` (`client/js/room-ui.js:535-569`), và 2 handler
  `btnRematch`/`btnCloseOverlay` (`client/js/room.js:196-211`) — không còn
  đường nào set `.visible` cho phần tử này nữa, xoá luôn thay vì để chết.
- **Không cần chữ Thắng/Thua** — bàn cờ đã tô đỏ nước thắng
  (`_drawWinHighlight`, `client/js/board.js:645-654`, không đổi).
- **Case Hoà — đã hỏi riêng, người dùng xác nhận không cần thông báo dạng
  modal**, lý do: hoà là do 2 bên tự đồng ý (`game:draw_accept`), người bấm
  đồng ý đã biết kết quả ngay lúc bấm. Chỉ cần **cải thiện toast/system-chat
  message** đang có sẵn cho rõ ràng hơn (vd. "Ván đấu hoà theo thoả thuận"),
  không cần modal riêng.
- **Kết thúc ván = coi như "cặp ghế mới" của flow B36**, không phải 1 nhánh
  đặc biệt: `handleGameEnd`/`game:ended` (`server/socket/handlers/
  GameHandler.js`) reset `room.state` về trạng thái không phải `'playing'`,
  `ready=false` cho cả 2, `readyMissCount=0`, `readyDeadline=null` — sau đó
  chạy đúng lại từ đầu luồng B36 (chờ 1 người bấm "Bắt đầu" → 15s → …). Không
  cần event `game:rematch` riêng nữa — **người dùng xác nhận: "Mới hoàn
  toàn, lặp lại luồng start như cũ"**, không có xử lý đặc biệt gì cho rematch
  so với ván đầu tiên của phòng.

**Đảo ngược 1 ranh giới cũ từ B35 — cố ý, không phải quên:** B35 từng ghi
"Không đụng: luồng `confirmStart`/`syncReadyWindow` cho lượt chơi ĐẦU TIÊN…
khác với luồng rematch". B36 **xoá bỏ sự khác biệt đó theo đúng ý người
dùng** — ván đầu tiên và rematch giờ dùng chung 100% một luồng. Khi implement
B36, được phép sửa cả đường "ván đầu tiên" nếu cần thống nhất, đây không còn
là ranh giới phải giữ.

**Việc phụ cần dọn kèm:**
- `syncReadyWindow` cần đổi tên/tách logic vì hành vi cũ ("tự mở khi
  bothSeated") không còn đúng — cân nhắc đổi thành 2 hàm rõ ràng: 1 hàm dọn
  dẹp trạng thái khi mất ghế (`clearReadyState`, thay cho phần
  "no-op nếu !bothSeated" cũ), 1 hàm xử lý bấm "Bắt đầu"
  (`handleReadyClick`/tương đương) thay cho việc set deadline ngay trong
  `room:sit`.
- `handleReadyWindowTimeout` (`state.js:384-403`) và
  `forceUnreadyPlayersToStand` (`RoomManager.js:471-486`) phải đổi từ "kick
  toàn bộ người chưa ready" sang "chỉ kick đúng 1 slot không bấm, chỉ khi
  `readyMissCount` đã chạm 3" — đây là thay đổi hành vi lớn nhất ở tầng
  server, viết test kỹ cho đúng 3 nhánh: trượt 1-2 lần (không kick, không
  reset ai), trượt lần 3 (kick đúng người), đứng dậy giữa chừng (reset về 0,
  không tính là trượt).
- System chat message ở mỗi lần trượt/kick cần cập nhật nội dung cho khớp cơ
  chế mới (vd. "Người chơi X chưa sẵn sàng (lần 2/3)" thay vì thông báo kick
  ngay).
- `client/js/room-ui.js` `renderStartModal()` cần đọc thêm
  `readyMissCount`/ai đã bấm để hiển thị đúng text ("Chờ đối thủ bấm Bắt
  đầu…" / "Còn Ns" / không hiện gì khi chưa ai bấm).

**Test:** server-side có hạ tầng Jest thật — bắt buộc viết test cho toàn bộ
máy trạng thái mới (`readyMissCount` tăng/reset/kick) theo đúng rule
"Bug-fix workflow" trong `CLAUDE.md`, không được bỏ qua vì "chỉ là UX".
Client-side (`start-modal` CSS reposition, bỏ `#game-overlay`) vẫn chưa có
unit-test framework — dùng Playwright (`e2e/`) theo đúng tiền lệ B14/B18/B35,
đặc biệt cần 1 test xác nhận **modal không chặn click** (đứng dậy được /
chat được trong lúc modal đang hiện) vì đây là lý do chính của toàn bộ
redesign này.

**Không đụng:** cơ chế `EMPTY_ROOM_GRACE_MS`/`room:stand` khi đang `'playing'`
(giữ nguyên, không liên quan tới B36), `game:moved`/`timer:sync` (không đổi
gì trong ván đang chơi), quota `MAX_ROOMS_PER_IP`/`MAX_USERS_PER_ROOM`.

---

### B37. Timer phải chạy ngay từ lúc bắt đầu ván Swap2, không ngoại lệ (từ báo cáo người dùng, 2026-08-04)

**Nguồn:** người dùng test thủ công phát hiện 2 lỗi đếm giờ trong luồng
Swap2, agent xác nhận cả 2 qua đọc code (không chỉ tin lời báo cáo), dựng sơ
đồ luồng hiện tại (state diagram + sequence diagram, mermaid) cho người dùng
xem, sau đó người dùng tự chốt hướng đi. **Coi quyết định dưới đây là đã
chốt**, không phải gợi ý còn mở.

**2 lỗi gốc (đã xác nhận bằng code, không phải suy đoán):**
1. `startGame()` nhánh `ruleSwap2` (`server/socket/handlers/GameHandler.js:
   576-605`) emit `game:init` với `timer: null`, **không gọi
   `startTimerForGame()`**. `startTimerForGame()` chỉ được gọi muộn, bên
   trong `game:swap2_choice` khi khai cuộc đã resolve xong (`r.done`, dòng
   158-159). Suốt `place3`/`p2choice`/`place2`/`p1choice`, `timerMap` không
   có entry cho phòng → không ai bị trừ giờ.
2. `TimerManager` constructor hard-code `this.activeColor = 'black'`
   (`server/managers/TimerManager.js:59`) — đúng cho ván thường (Đen đi
   trước) nhưng sai cho Swap2, vì luật Swap2 quy định **Trắng luôn đi
   trước** sau khi resolve (`_assignColors`, `GameEngine.js:380`:
   `this.currentTurn = this.players.find(p => p.color === 'WHITE').userId`).
   `startTimerForGame()` không truyền `activeColor` khởi tạo theo
   `engine.currentTurn` thực tế → timer luôn trừ giờ Đen dù đang là lượt
   Trắng.

**Yêu cầu người dùng chốt:** tính giờ **ngay từ khi bắt đầu ván**, kể cả
trong lúc đặt quân mở màn / chọn bên — không có giai đoạn nào được miễn trừ
("Apply Time manager right after START game. Không có ngoại lệ").

**Khó khăn cốt lõi — đọc kỹ, đây là điểm dễ làm sai nhất:** trong các phase
`place3`/`p2choice`/`place2`/`p1choice`, màu quân của 2 người chơi **chưa
được gán** (`players[].color = null`, xem `GameEngine.js` constructor
dòng 116-129 và `swap2Choice`/`_assignColors`). `TimerManager` lại xoay
quanh nhãn `'black'/'white'` — không thể tra
`engine.players.find(p => p.color === 'BLACK')` như `startTimerForGame()`
hiện làm, vì kết quả sẽ là `undefined` trong lúc khai cuộc.

**Giải pháp đã thiết kế (giữ nguyên API cũ của `TimerManager`, không phá vỡ
`addTime`/`DisconnectHandler`/test hiện có):** dùng `firstPlayerId`/
`secondPlayerId` (đã có sẵn trên engine, cố định suốt khai cuộc) làm **nhãn
placeholder** cho 2 khe đếm `black`/`white`, rồi **remap** sang màu thật khi
`_assignColors()` chạy. `firstPlayerId` luôn là người đi/chọn trước tại thời
điểm khởi tạo timer nên nhãn mặc định `activeColor = 'black'` của
constructor đã đúng cho bước đầu (`place3`) — không cần thêm tham số
constructor mới.

1. **`server/managers/TimerManager.js`** — thêm method mới, không đổi gì cũ:
   ```js
   remapForSwap2(realBlackPlayerId, realWhitePlayerId) {
     if (this.blackPlayerId !== realBlackPlayerId) {
       [this.black, this.white] = [this.white, this.black];
     }
     this.blackPlayerId = realBlackPlayerId;
     this.whitePlayerId = realWhitePlayerId;
     this.activeColor = 'white'; // luật Swap2: Trắng luôn đi trước sau resolve
   }
   ```
2. **`server/socket/handlers/GameHandler.js`:**
   - `startTimerForGame(io, room, engine, idOverride)`: thêm tham số tuỳ
     chọn `{ blackPlayerId, whitePlayerId }`; dùng override này thay cho
     `engine.players.find(p => p.color === ...)` khi được truyền (trường
     hợp Swap2 chưa gán màu).
   - `startGame()` nhánh `ruleSwap2` (dòng ~576-605): ngay sau khi tạo
     `engine`, gọi `startTimerForGame(io, room, engine, { blackPlayerId:
     engine.firstPlayerId, whitePlayerId: engine.secondPlayerId })`; đổi
     `game:init` payload từ `timer: null` thành `timer: timer.getTimers(),
     timerSync: timer.getSync()`.
   - `game:swap2_place` handler (dòng ~116-140): sau khi
     `engine.placeOpeningStone()` thành công, nếu `r.currentTurn !==
     user.userId` (lượt đã đổi người — hết phase), lấy
     `timer = timerMap.get(room.roomId)` rồi gọi
     `timer.switchTurn(r.currentTurn === engine.secondPlayerId ? 'white' :
     'black')` + emit `timer:sync`. Nếu lượt chưa đổi (đang đặt quân thứ
     2/3 cùng phase), không cần làm gì thêm.
   - `game:swap2_choice` handler (dòng ~144-176): nhánh `choice === 'place'`
     (chưa `done`) không cần switch (lượt vẫn ở `secondPlayerId`). Nhánh
     `r.done === true`: **bỏ** lệnh gọi `startTimerForGame(io, room,
     engine)` hiện tại (tạo `TimerManager` mới → mất thời gian đã tích luỹ
     trong khai cuộc) — thay bằng lấy `timer = timerMap.get(room.roomId)`
     rồi gọi `timer.remapForSwap2(blackPlayer.userId, whitePlayer.userId)`
     (với `blackPlayer`/`whitePlayer` tra theo `engine.players.find(p =>
     p.color === ...)`, lúc này màu đã gán xong). Đoạn emit `timer:sync`
     ngay sau đó (dòng 162-163) giữ nguyên, không cần đổi.
   - `GameEngine.js` không cần sửa: `currentTurn`/`openingPhase`/
     `handleTimeout()` (dòng 482, chỉ so `userId` không quan tâm màu) đã
     đúng sẵn.
   - `DisconnectHandler.js` không cần sửa: `timer.stop()/start()/getSync()`
     không quan tâm phase — khi timer tồn tại xuyên suốt khai cuộc, pause/
     resume khi mất kết nối giữa lúc Swap2 tự động đúng (cải thiện thêm,
     không phải side-effect xấu cần lo).

3. **Client — `client/js/game-ui.js`:** `renderSwap2()` hiện đang ẩn hẳn
   turn-bar (`setTurnBarVisible(false)`) — nếu chỉ sửa server thì đồng hồ
   chạy đúng nhưng người dùng không thấy gì. Cần: đổi thành
   `setTurnBarVisible(true)`; khi `swap2.colorsAssigned === false`, gán tên
   vào 2 khe `tb-black-name`/`tb-white-name` theo `swap2.firstPlayerId`/
   `secondPlayerId` (tra trong `st.gameState.players` theo `userId`, không
   theo `color` vì đang `null`). `renderTimers()` — đoạn tính `isBlackTurn`
   dựa vào `players.find(p => p.color === 'BLACK')` sẽ luôn `undefined`
   trong lúc khai cuộc; thêm nhánh: nếu `st.gameState.swap2 &&
   !st.gameState.swap2.colorsAssigned`, so `currentTurn ===
   swap2.firstPlayerId` để tô sáng đúng khe đang đếm. Bump `?v=N` theo rule
   `CLAUDE.md` vì đụng `client/js/`.

**Test:** `server/tests/TimerManager.test.js` bắt buộc có test cho
`remapForSwap2()` (2 nhánh: firstPlayer thật sự là Đen → không hoán đổi,
`activeColor` → `'white'`; firstPlayer hoá ra là Trắng → phải hoán đổi đúng
`this.black`/`this.white` + `blackPlayerId`/`whitePlayerId`, `activeColor` →
`'white'`) theo rule "Bug-fix workflow" trong `CLAUDE.md`. Client-side
(`client/js/game-ui.js`) chưa có Jest/unit-test framework — verify bằng chạy
app thật (2 tab, bật luật Swap2, quan sát đồng hồ chạy đúng người ở mọi
phase + đổi đúng lượt + dừng/resume đúng khi ngắt kết nối giữa khai cuộc)
hoặc mở rộng `e2e/swap2-opening.spec.ts` nếu cần — hiện file này chưa có
assertion nào về timer.

**Không đụng:** `GameEngine.js` state machine của Swap2 (`swap2Choice`/
`placeOpeningStone`/`_assignColors` — logic phase/currentTurn đã đúng, chỉ
timer là sai), `DisconnectHandler.js` (không cần sửa, xem lý do ở trên),
API công khai cũ của `TimerManager` (`black`/`white`/`activeColor`/
`blackPlayerId`/`whitePlayerId`/`addTime`/`switchTurn`/`applyMove` — chỉ
thêm method mới `remapForSwap2`, không đổi hành vi các method cũ).

---

## §39 — Guest/spectator reconnect thiếu grace period (TODO.md #39)

**Bối cảnh phát hiện:** người dùng yêu cầu kiểm tra reconnect logic cho (1)
player đang chơi và (2) guest trong bàn. Đã đọc
`server/socket/handlers/DisconnectHandler.js`, `server/socket/SocketHandler.js`,
`server/managers/RoomManager.js` bằng codegraph. Kết luận: có đúng 2 nhánh
grace, và khoảng trống nằm GIỮA 2 nhánh đó, không phải toàn bộ luồng reconnect
đều hỏng — case (1) player-in-active-game hoạt động đúng, không cần sửa.

**Chỗ cần sửa:** `handleDisconnect()`
(`server/socket/handlers/DisconnectHandler.js:36-72`). Hiện tại:
```
if (room && room.gameState && room.gameState.status === 'ongoing') { ... player → grace }
if (room.users.size === 1) { ... sole occupant → grace }
// còn lại → finalizeNormalLeave ngay, KHÔNG có case nào ở giữa
```
Cách tiếp cận gợi ý: thêm một grace period thứ 3 (có thể tái dùng cơ chế của
`startEmptyRoomGrace`, đổi tên tổng quát hơn hoặc thêm hàm mới
`startSpectatorGrace`) áp dụng cho case "còn người khác trong phòng nhưng
`gameState` không `ongoing` (hoặc user không phải player)". Thời lượng grace
gợi ý: dùng chung `config.EMPTY_ROOM_GRACE_MS` hoặc thêm hằng số mới riêng
(ví dụ `SPECTATOR_GRACE_MS`) trong `server/config.js` — **hỏi lại người dùng
thời lượng cụ thể trước khi hard-code**, không tự đoán số giây.

**Điểm mấu chốt không được bỏ sót:** `SocketHandler.js:160-176` — nhánh
`socket.handshake.auth.reconnect === true` emit `room:destroyed` khi
`roomManager.getRoomByUser` trả về `null`. Nhánh này được viết đúng cho use
case "phòng thật sự đã bị huỷ khi client offline" (server restart / idle
cleanup) — **không được xoá nhánh này**, chỉ cần đảm bảo user không bị xoá
khỏi `userRoomMap` quá sớm (trong lúc grace) để `getRoomByUser` vẫn trả về
đúng phòng khi họ reconnect kịp thời, giống hệt cách
`startEmptyRoomGrace`/`startDisconnectGrace` đang giữ user trong map cho tới
khi grace hết hạn.

**Không đụng:** `startDisconnectGrace`/`cancelDisconnectGrace` (case player
trong ván `ongoing` đã đúng, xác nhận qua đọc code — không có bug ở đây),
cơ chế `game:interrupted`/`game:resumed`, `TimerManager` pause/resume.

**Test dự kiến:** mở rộng `server/tests/DisconnectHandler.test.js` (đã có
fixture `twoPlayerRoom`) — thêm case guest/spectator rớt mạng khi còn ≥2
người trong phòng và game không `ongoing`, xác nhận: (a) không bị xoá khỏi
`room.users` ngay, (b) reconnect trong thời gian grace → được nối lại đúng
phòng, không nhận `room:destroyed`, (c) reconnect sau khi grace hết hạn →
mới thực sự bị xoá.

## §40 — `room.html` không `?id=` freeze ở overlay "Đang vào phòng" (TODO.md #40)

**Bối cảnh phát hiện:** người dùng báo dán link `room.html` trần (không tạo
phòng trước) → màn hình đứng im, không fallback về sảnh chờ. Đã xác nhận
bằng đọc `client/js/room-socket.js:377-398` (`processRoomIntent`) và
`client/room.html:45-50` (`#room-entry-overlay`).

**Chỗ cần sửa:** `processRoomIntent()` trong
`client/js/room-socket.js:393-397` — nhánh `else` hiện tại:
```javascript
} else {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('id');
  if (roomId) client.emit('room:join', { roomId });
}
```
Thêm `else` fallback khi `!roomId`: redirect `window.location.href =
'index.html'`. Đây là toàn bộ phạm vi sửa — **không cần đổi** nhánh
`intent.action === 'create'`/`'join'` phía trên, không cần đổi
`#room-entry-overlay` hay `hideEntryOverlay()`.

**Cân nhắc UX nhỏ trước khi sửa (hỏi người dùng nếu muốn khác):** redirect
ngay lập tức không hiện thông báo gì — có thể người dùng muốn 1 toast ngắn
kiểu "Thiếu mã phòng, đưa bạn về sảnh chờ" trước khi chuyển trang (tham khảo
pattern đã có ở `room:kicked`/`room:destroyed` trong cùng file, dùng
`showToast` + `setTimeout` 1500ms). Không tự quyết định thêm toast nếu không
được yêu cầu — giữ bug-fix tối giản theo đúng nội dung `TODO.md` #40 trừ khi
người dùng xác nhận muốn có thông báo.

**Không đụng:** `client/room.html` cấu trúc overlay, luồng `sessionStorage
gvn_room_intent` (được set từ `index.html` lúc tạo/join phòng — không phải
nguồn của bug này).

**Test dự kiến:** `client/js/` chưa có Jest — verify bằng Playwright
(`e2e/`) case mới: mở `room.html` không query string, assert URL cuối cùng
là `index.html`. Không viết test tay rồi xoá — giữ lại theo rule
"Bug-fix workflow" trong `CLAUDE.md`.

---

### A10. ~~`cloudflared` với `X-Forwarded-For` thật~~ — chuyển sang §44 (review 12.6)

**Đã đóng, chuyển sang Phần B #44 (2026-08-04).** Không cần request thật đi
qua tunnel để xác minh nữa — kiểm bằng Cloudflare API (`mcp__cloudflare-api`)
xác nhận zone `play3cr.dpdns.org` proxied thật (`proxied: true`), nên
Cloudflare edge luôn tự set `CF-Connecting-IP`, ghi đè chứ không cho client
nối thêm/giả mạo. Đọc thẳng header đó thay vì tiếp tục suy luận qua
`X-Forwarded-For` là việc sửa được bằng code — xem §44 bên dưới.

### A11. `permessage-deflate` (review 8.5, TODO.md #11)

- Đây là quyết định cấu hình (bật/tắt nén WebSocket), không phải bug — dự án
  hiện dùng mặc định của engine.io/socket.io mà **chưa ai xác nhận** mặc định
  đó là gì ở runtime thật (giả định tắt, chưa đo).
- Nếu quyết định bật: đo lại băng thông (giảm) và CPU/độ trễ (tăng do nén mỗi
  frame) trên server thật, đối chiếu với các số đã đo ở mục 4 (broadcast) —
  đừng bật rồi bỏ qua, vì review đã cho thấy CPU không phải nút thắt hiện tại
  nhưng nén thêm có thể đổi lại điều đó ở tải cao.
- **Không tự bật** nếu người dùng chưa xác nhận muốn đánh đổi CPU lấy băng
  thông — ghi rõ 2 phương án và số đo dự kiến cần thu thập trước khi hỏi.

---

## §41 — Debounce `lobby:online_users` gần vô dụng ở nhịp reconnect thật (review 12.5, TODO.md #41)

**Đừng nhầm với TODO #29** — debounce hiện có (`ONLINE_USERS_DEBOUNCE_MS =
300`, `server/socket/state.js`) được thêm để giảm chi phí O(n²) lúc **burst**
6000 người connect đồng thời, dùng đúng pattern `broadcastLobbyUpdate()`
(per-`io` WeakMap timer). Đó là một vấn đề khác — chi phí CPU lúc burst — với
vấn đề review 12.5 nêu: **hiệu quả giảm gói tin** ở nhịp reconnect rải rác
thật (mỗi lần cách nhau 150-400ms do backoff của client, không phải burst).
Cả hai đều đúng, không loại trừ nhau — sửa #41 không được làm hồi quy #29.

**Hướng sửa rẻ (khuyến nghị làm trước):** nâng `ONLINE_USERS_DEBOUNCE_MS` lên
1-2s — cùng bài học đã áp dụng cho `lobby:update` debounce (TODO #9, cửa sổ
300ms không khớp nhịp người thật ~1200ms). Không giảm được payload, chỉ giảm
số gói.

**Hướng sửa thật (xa hơn, không bắt buộc trong lần này):** chuyển
`lobby:online_users` sang delta `{added, removed}` giống `lobby:patch` (TODO
#9) và `room:updated` delta (TODO #8 phần mở rộng) — khi đó cửa sổ debounce
bao nhiêu không còn quan trọng vì gói không đổi thì không gửi.

**Test:** mô phỏng đúng backoff 1000-5000ms của `client/js/socket-client.js`
(không phải burst đồng loạt) trong test debounce, assert số gói giảm đáng kể
so với baseline không debounce — bài test cũ (nếu có) chỉ assert case burst
thì không đủ để coi mục này đã được bảo vệ.

---

## §42 — `cancelEmptyRoomGrace` thiếu test cho đúng kịch bản mutation (review 12.5, TODO.md #42)

**Trước khi làm, đọc lại test đã có** từ TODO #18 (vòng 2) trong
`server/tests/DisconnectHandler.test.js`, describe "empty-room grace period"
— đã có case "cancel qua reconnect thì không gọi `leaveRoom`". Việc đầu tiên
là xác nhận case đó có thật sự đỏ khi gỡ `cancelEmptyRoomGrace` (không phải
gỡ toàn bộ cơ chế grace) hay không, bằng mutation-check trên bản copy — nếu
nó đã đỏ đúng, mục này coi như đóng và chỉ cần cập nhật `TODO.md` ghi lại
bằng chứng, không cần viết thêm code/test mới.

**Nếu case đó không bắt được mutation cụ thể này:** viết case mới dựng đúng
kịch bản review đã đo — phòng có đúng 1 người, người đó disconnect (bắt đầu
`startEmptyRoomGrace`), rồi **họ reconnect trong lúc grace đang chạy**
(`cancelEmptyRoomGrace` được gọi), sau đó chờ qua mốc 20s gốc (giả lập bằng
fake timer) — assert phòng **vẫn còn sống** vì `cancelEmptyRoomGrace` đã huỷ
timer đúng cách. Mutation cần bắt: gỡ hẳn lệnh gọi `cancelEmptyRoomGrace`
(không phải gỡ cả grace) → phòng phải **bị xoá sai** dù user đang online, vì
timer gốc vẫn chạy tiếp.

**Không đụng:** logic `startEmptyRoomGrace`/`cancelEmptyRoomGrace` hiện có —
mục này chỉ thêm test, không đổi hành vi.

---

## §43 — Grace 20s + `MAX_ROOMS_PER_IP` khoá nhầm người dùng chung IP (review 12.5, TODO.md #43)

**Bản chất vấn đề:** `MAX_ROOMS_PER_IP` (TODO #7, `RoomManager.js`) đếm quota
bằng cách **quét `this.rooms`** tại thời điểm tạo phòng (cố ý chọn cách này
để không có đường decrement nào bị quên — xem `docs/fix-log.md` 2026-08-02
02:37). Grace period 20s (TODO #18 vòng 2) giữ phòng **sống trong map** thêm
20s sau khi người cuối cùng rời/rớt mạng, để họ reconnect được. Hai cơ chế
này cộng lại nghĩa là: phòng bỏ hoang vẫn đếm vào quota của IP tạo ra nó
trong suốt 20s, dù không còn ai trong đó.

**Ràng buộc quan trọng — không được phá vỡ khi sửa:** đừng quay lại kiểu bộ
đếm tăng/giảm riêng cho quota (tally) — đúng lý do `MAX_ROOMS_PER_IP` chọn
cách quét-trực-tiếp thay vì tally là để tránh lớp bug "quên decrement ở 1
trong N đường teardown". Nếu tách "phòng còn sống" khỏi "phòng tính vào
quota", **vẫn phải đếm bằng cách quét** — ví dụ quét `this.rooms` nhưng bỏ
qua phòng đang trong `emptyRoomGraceTimers` (đang chờ xoá, không còn ai)
thay vì cộng thêm 1 map đếm riêng.

**Rủi ro cần tránh khi sửa:** nếu nhả quota ngay lúc bắt đầu grace (thay vì
lúc phòng thực sự bị xoá), một client có thể lách `MAX_ROOMS_PER_IP` bằng
cách tạo phòng → rời ngay lập tức (kích hoạt grace) → tạo phòng mới — lặp lại
liên tục để giữ nhiều hơn 3 phòng "gần sống" cùng lúc. Đây chính xác là kiểu
tấn công `MAX_ROOMS_PER_IP` được thêm vào để chặn (review 3.2). Cần đảm bảo:
phòng đang trong empty-room-grace vẫn tính vào quota của IP đó cho tới khi
**hoặc** grace hết hạn thật (phòng bị xoá) **hoặc** đủ lâu để coi là bỏ hoang
thật — không nhả ngay lập tức chỉ vì "đang chờ".

**Hướng khả dĩ, cần hỏi người dùng chọn trước khi sửa:** (a) giữ nguyên hành
vi hiện tại, chỉ rút ngắn `EMPTY_ROOM_GRACE_MS` cho case đây (đánh đổi ít hơn
thời gian phục hồi phòng); (b) tách 1 quota riêng nhỏ hơn cho phòng "đang
grace" (vd. không tính phòng-đang-grace vào `MAX_ROOMS_PER_IP` cứng nhưng
vẫn có 1 giới hạn phụ để chặn lách quota); (c) chấp nhận đây là rủi ro thấp
(người dùng chung IP hợp lệ hiếm khi đụng đúng lúc 3 phòng cùng trong grace)
và không sửa. **Không tự chọn (b) chỉ vì nó "đúng nhất về mặt kỹ thuật"** —
đây là đánh đổi UX-vs-an-toàn-chống-abuse mà reviewer để ngỏ, cần người dùng
quyết định trước khi code.

**Test dự kiến (khi đã chọn hướng):** case trong `RoomManager.test.js` dựng
đúng kịch bản — 3 phòng cùng IP, 1 phòng vào grace (chủ rời), assert quota
theo đúng hướng đã chọn (nhả ngay hay giữ), và **thêm 1 case chống lách quota**
xác nhận việc lặp lại tạo-rồi-rời không cho phép vượt quá giới hạn thật.

---

## §44 — `getClientIp()` ưu tiên `CF-Connecting-IP` (review 12.6, TODO.md #44)

**Bối cảnh xác nhận (2026-08-04, qua Cloudflare API, không phải giả định):**
zone `play3cr.dpdns.org` (id `5008081877e47332e151721d4d3cc8c9`) là zone
riêng trên Cloudflare, `status: active`, bản ghi CNAME trỏ tới tunnel
`aae65c10-cae3-4fdf-8e61-42e3c59a954f.cfargotunnel.com` với `proxied: true`.
Tunnel `GomokuApp` chỉ có 1 ingress rule (`play3cr.dpdns.org →
http://localhost:3000`, `originRequest: {}`, không override gì). Hai dữ kiện
này cùng xác nhận: (1) mọi request public đều đi qua Cloudflare edge thật —
Cloudflare **tự set** `CF-Connecting-IP` ở edge, ghi đè bất kỳ giá trị client
tự gửi, không thể giả mạo; (2) `cloudflared` nối vào Node qua loopback trần,
đúng như `trust proxy: 'loopback'`/`getClientIp()` hiện tại đang giả định.

**Chỗ sửa:** `getClientIp(socket)` trong `server/socket/state.js`. Thứ tự ưu
tiên mới:
1. `socket.handshake.headers['cf-connecting-ip']` nếu có mặt — dùng thẳng,
   không cần kiểm `socket.handshake.address` có phải loopback hay không
   (Cloudflare tự đảm bảo tính đúng đắn của header này ở edge, khác
   `X-Forwarded-For` vốn client tự viết được).
2. Không có `CF-Connecting-IP` (vd. dev local không qua Cloudflare) → giữ
   nguyên logic cũ: đọc `X-Forwarded-For` **chỉ khi** `socket.handshake.
   address` là loopback, ngược lại dùng thẳng `socket.handshake.address`.

**Vì sao vẫn giữ fallback thay vì xoá hẳn nhánh `X-Forwarded-For`:** dev
local (`npm start` không qua tunnel) và bất kỳ deployment tương lai nào khác
Cloudflare Tunnel vẫn cần đường vào cũ hoạt động — đừng coi cấu hình hiện tại
là vĩnh viễn.

**Không đụng:** phía Express (`app.set('trust proxy', 'loopback')` trong
`server/index.js`) — đây là tầng khác (HTTP route, dùng cho `authLimiter`),
không liên quan tới `getClientIp()` (tầng socket, dùng cho
`MAX_ROOMS_PER_IP`). Không gộp 2 tầng lại dù chúng dùng chung ý tưởng
"loopback nghĩa là tin cậy".

**Test dự kiến:** thêm case vào `server/tests/LobbyHandler.test.js` (hoặc
file test hiện có của `getClientIp`) — (a) có header `cf-connecting-ip` →
dùng đúng giá trị đó dù `x-forwarded-for` khác; (b) không có
`cf-connecting-ip`, peer loopback, có `x-forwarded-for` → hành vi y hệt
trước khi sửa (regression guard); (c) không có cả hai → dùng
`socket.handshake.address`. Mutation-check: gỡ nhánh ưu tiên
`cf-connecting-ip` → case (a) phải đỏ.

---

## "Đừng làm" — reviewer chỉ rõ ranh giới không nên đụng

- **Đừng chuyển `game:moved` sang delta** — đã là delta tối ưu (121 B/nước,
  ngang mức tối ưu của dự án cùng bài toán). Không có việc gì để làm ở đây.
- **Đừng đụng `client/js/socket-client.js:40`** — cách chọn `ws://`/`wss://`
  theo origin đã đúng, sửa vào đây có thể tạo lại đúng lỗi TLS đang tránh.
- **Đừng nới rate limiter trong code production chỉ để tự test được** (xem quy
  tắc chung #0) — nếu cần test hơn 20 "người dùng", restart server giữa các đợt
  thay vì đổi ngưỡng.
- **Đừng sửa file gốc để chạy mutation test** — luôn copy sang thư mục tạm.
