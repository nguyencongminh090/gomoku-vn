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
- **Timing attack trên login** (review 3.6) — `bcrypt` không load được trên máy
  đánh giá nên chưa đo được chênh lệch thời gian phản hồi thật. Sau khi áp fix
  "always compare với dummy hash" (xem Phần B #8), nên đo lại trên máy có
  bcrypt hoạt động để xác nhận thời gian phản hồi giữa "user không tồn tại" và
  "sai mật khẩu" không còn phân biệt được.
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

2. ~~**Chat sanitize → escape entity** (review 3.5) — `ChatHandler.js:74`, đổi
   `replace(/<[^>]*>/g,'')` → escape `&lt;`/`&gt;`.~~
   **✅ ĐÃ XONG** (2026-08-01, commit `8fb3c4e`, merge `248ff36`) — `sanitize()`
   nay escape `<`/`>`; **cố ý không escape `&`** (client render bằng
   `textContent`, escape `&` sẽ làm hỏng chữ thường như "R&D", mà cũng không
   thêm an toàn gì). Test: file mới `ChatHandler.test.js`, 11 case gồm đúng
   chuỗi repro của review; `npm test` 159/159 xanh. Chi tiết: `docs/fix-log.md`.

3. **`escapeAttr` sửa đúng cách escape** (review 3.7) — `lobby.js:474-476`,
   `room-ui.js:62-64`, đổi `\"`/`\'` → `&quot;`/`&#39;`. Rẻ, không rủi ro (input
   hiện tại không chứa `"`/`'`). Test: client-side, **chưa có test infra**
   (`package.json` jest config chỉ match `server/tests/**/*.test.js`, không
   jsdom) — cân nhắc tách `escapeAttr` thành hàm thuần import được từ Node để
   test mà không cần dựng jsdom.

4. **`SELECT *` lộ player_id + thiếu rate limit `GET /api/games`** (review 6.4)
   — chọn cột tường minh (bỏ `black_player_id`/`white_player_id` khỏi response
   `GET /api/games/:id`), thêm rate-limit middleware giống `authLimiter` cho
   `/api/games`. Rẻ, thấp rủi ro — cần grep client (`history.js`) xác nhận
   không đọc 2 cột đó trước khi bỏ. Test: chưa có test file cho route `games`,
   cần tạo mới.

5. **Idle-scan magic number → config** (review 5.5) — `RoomManager.js:49-52`,
   rút `60000` thành hằng số trong `config.js`. Thuần rename, không cần test
   riêng.

6. **Timing attack — dummy bcrypt compare** (review 3.6) — `auth.js:135-143`,
   khi `!user` vẫn chạy `bcrypt.compare(password, DUMMY_HASH_CỐ_ĐỊNH)` trước
   khi trả lỗi. Đúng về logic; **hiệu quả thời gian thực chưa đo được** (xem
   Phần A #4 — cần đo lại sau khi áp). Test: file mới cho `auth.js`, assert
   `bcrypt.compare` được gọi đúng 1 lần dù `user` có tồn tại hay không (test
   tính đối xứng code path, không test thời gian thật).

7. **Room quota theo IP** (review 3.2) — `RoomManager.createRoom()`, đếm số
   phòng theo IP người tạo, chặn khi vượt ngưỡng (không phải 1 — tránh khoá oan
   NAT/wifi chung IP). Rủi ro thật: phải nhớ decrement khi phòng đóng qua CẢ
   đường idle-timeout lẫn đóng chủ động, không chỉ 1 đường. Test: file mới
   `RoomManager.test.js` (hiện chưa tồn tại — không có test nào cho
   RoomManager), cover cả 2 đường decrement.

8. **Bỏ `settings` khỏi `room:updated`** (review 4.2) — `RoomManager.js`
   `serializeRoom()`, chỉ gửi `settings` khi thực sự đổi. Rủi ro chính: có
   **17 điểm emit** `room:updated` trong review, bỏ sót 1 điểm là để lại lỗ
   hổng cũ; cũng cần kiểm client (`room-ui.js`, `room-socket.js`) đọc
   `settings` không optional-chain ở đâu trước khi đổi. Test: mở rộng
   `LobbyHandler.test.js` (hiện chỉ cover `room:create`/`room:join`) hoặc file
   mới, table-driven qua các điểm emit đại diện.

9. **`lobby:update` → delta thật** (review 4.1/13, fix-log #12 mới debounce
   nửa vế) — `state.js` `broadcastLobbyUpdate`, emit `{roomId, patch}` thay vì
   full list; client giữ map cục bộ + merge. Rủi ro cao nhất nhóm: phải xử
   đúng phòng mới (full-insert), phòng xoá (patch kiểu remove), và **client
   join giữa chừng phải nhận full snapshot 1 lần trước khi nhận delta** — thiếu
   bước này client mới sẽ thấy list sai tới khi F5. Test: hiện `state.js` thật
   không được test trực tiếp (`LobbyHandler.test.js`/`DisconnectHandler.test.js`
   đều `jest.mock` nó) — cần test không-mock mới, cover cả 3 case trên.
   **Cập nhật (kiểm chứng `3da53dd`):** debounce 300ms của fix #12 **không đạt
   mục tiêu** ở nhịp người chơi thật (~1200ms giữa các hành động) — vẫn ra 4 gói
   / 10 759B giống hệt trước khi có debounce, vì mỗi hành động rơi vào cửa sổ
   riêng. Chỉ ăn khi hành động dồn dập (<300ms, vd. tạo 10 phòng liên tiếp: 11→4
   gói). Phần tốn thật vẫn là payload (2 670B full-list cho 1 thay đổi), đúng
   như review đã chỉ ra. **Giải pháp rẻ tạm thời:** nâng cửa sổ debounce lên
   1–2s (đổi `LOBBY_UPDATE_DEBOUNCE_MS` ở `state.js`) — 1 dòng, an toàn, che
   được nhịp người thật nhưng không giảm payload. **Giải pháp thật** vẫn là làm
   nốt phần delta ở trên — khi đó cửa sổ debounce bao nhiêu không còn quan trọng.

10. **`timer:tick` → gửi `deadline` 1 lần/lượt** (review 4.3) — server
    `TimerManager.js` + `GameHandler.js:441`; client `game-ui.js`/`board.js` tự
    đếm ngược. Rủi ro nhất danh sách: lệch đồng hồ client/server (không NTP-sync)
    có thể gây đếm sai — cần gửi kèm server time để client tính offset. Sửa cả
    2 phía, không thể chỉ đổi server. Test: `TimerManager.test.js` đã có
    describe "start/tick" — cần **viết lại**, không chỉ thêm; phía client
    **chưa có test infra** (như mục 3) — việc dựng infra riêng cho mục này lớn
    hơn bản thân fix.

### Nguồn: kiểm chứng bản sửa (commit `3da53dd`, đo lại 2026-08-01)

Không thuộc review gốc — phát hiện mới từ đợt kiểm chứng, nhưng sửa được bằng
code và nên ưu tiên cao vì rẻ.

11. **Viết test cố định cho 6 fix hiện không có gì bảo vệ** — mutation test (gỡ
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

---

<!-- Khi nhận báo cáo mới: thêm heading "### Nguồn: <tên báo cáo>" dưới đúng
     Phần A hoặc Phần B, giữ định dạng số thứ tự + đánh giá hiệu quả/an toàn +
     trạng thái test như trên. -->
