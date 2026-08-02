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
