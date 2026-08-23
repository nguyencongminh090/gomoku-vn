# B152 — Hướng dẫn thực thi: ack + timeout + resync cho `game:move`

**Việc:** `docs/todo/B152-game-move-khong-co-ack-timeout-retry-gay-freeze.md`

---

## Bối cảnh điều tra (đọc trước, để không đào lại)

Báo cáo gốc từ người chơi ở Trung Quốc gộp **hai** triệu chứng, đã tách ra và trace riêng:

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Truy cập trang chậm/lag | Tuyến mạng TQ↔server | **Người dùng đã yêu cầu bỏ qua** — không nằm trong #152/#153 |
| ~0.5s mới thấy quân mình đặt | RTT thật, bị lộ 100% vì client chờ server mới vẽ | #153 |
| Đôi lúc freeze hẳn | Rớt gói im lặng, không ack/timeout/retry | **#152 (file này)** |

Phần điều tra mạng (đã làm, **không cần lặp lại**): domain thật `play3cr.dpdns.org` nằm dưới zone
miễn phí `*.dpdns.org` của DigitalPlat, chạy qua Cloudflare Tunnel. Zone này từng bị GFW chặn nguyên
cụm rồi tự gỡ sau ~18 tiếng (gfwlist issue #2710 ngày 2025-08-29 → #2711 ngày 2025-08-30); kiểm tra
lại 2026-08-23 thì **không** còn trong gfwlist. Nghiên cứu USENIX Security 2025 (gfw.report) mô tả cơ
chế GFW drop có chọn lọc theo bộ (IP nguồn, IP đích, cổng đích) trong ~180s thay vì chặn cứng — khớp
đúng biểu hiện "kết nối vẫn sống nhưng rớt gói lẻ tẻ", tức **đúng kịch bản mà #152 phải chịu được**.
Đây là bối cảnh giải thích *vì sao* cần #152, **không phải** việc phải sửa trong repo.

**Không đi tối ưu tầng server.** Đã đo/đọc code xác nhận đường `game:move` không có debounce, không
có ghi đĩa đồng bộ, `_checkWin` chỉ quét 4 hướng từ quân vừa đặt. Độ trễ **không** đến từ tính toán
server — tối ưu ở đó là sửa nhầm tầng.

---

## Ranh giới — "đừng làm"

- **Đừng sửa `SocketClient.emit()` hiện có.** Nhiều call site khác đang dùng nó với chữ ký hiện tại.
  Thêm **method mới** có ack + timeout, để `emit()` nguyên vẹn.
- **Đừng đụng debounce `broadcastRoomUpdate`** (`server/socket/state.js:372-383`, 80ms). Đó là đường
  phòng/sảnh, tách biệt hoàn toàn; nó đã được tối ưu có chủ đích (diff + coalesce) và không liên quan
  đến freeze khi đặt quân. Đọc kỹ để không nhầm hai đường với nhau.
- **Đừng siết `pingInterval`/`pingTimeout`** — đã cân nhắc và cố ý loại khỏi phạm vi (mục "Ngoài phạm
  vi" trong file TODO). Rủi ro false disconnect trên chính mạng mất gói của nhóm người dùng này, và
  có tiền lệ #131 chọn sai ngưỡng vì calibrate trên 1 mẫu.
- **Đừng tự mở rộng ack sang các sự kiện khác** (`room:sit`, `chat:message`, `game:swap2_choice`…).
  Báo cáo gốc chỉ nói về đặt quân. Nếu thấy chỗ khác cùng lỗ hổng, **ghi thành TODO riêng**, đúng rule
  "scope discipline" trong `CLAUDE.md`.
- **Đừng viết lại logic dựng `gameState` cho `game:resync`.** Tái dùng đúng thứ `room:joined` đang
  dùng ở `SocketHandler.js:233-266`. Hai đường dựng state khác nhau = hai đường phân kỳ.

---

## Bẫy kỹ thuật

1. **`ack` có thể `undefined` — guard bắt buộc.** Trong cửa sổ deploy vẫn còn client cũ (cache `?v=`)
   gửi bare emit. `ack(...)` khi `ack` là `undefined` sẽ throw trong handler và làm hỏng ván của
   người dùng đó. Dùng `if (typeof ack === 'function')`. **Đây là loại lỗi ship được mà không thấy
   ngay trên máy dev** (dev luôn có client mới).

2. **Idempotency: retry một nước đi đã được áp dụng.** Kịch bản: `game:move` tới server, đã apply,
   ack rớt trên đường về. Client retry → server trả `CELL_OCCUPIED` → người chơi thấy lỗi cho một
   nước đi **thực ra đã thành công**, và board hai bên lệch nhau.

   **Hướng đã chốt (cập nhật 2026-08-24): `moveId` uuid do client sinh**, server giữ tập `moveId` đã
   xử lý theo ván (dọn ở `handleGameEnd`), gặp lại thì phát lại `movePayload` cũ. **Retry phải gửi
   lại đúng `moveId` cũ, không sinh id mới** — đó là toàn bộ điểm mấu chốt, làm sai chỗ này thì cơ
   chế dedupe vô tác dụng hoàn toàn.

   ⚠️ **Hướng A cũ (dedupe theo nước đi cuối) ĐÃ BỊ BÁC BỎ — đừng khôi phục lại.** Nó xử lý sai khi
   gói gửi-lại về trễ và đối thủ đã kịp đi một nước chen vào giữa: "nước đi cuối cùng" không còn là
   nước cần dedupe nữa, điều kiện không khớp, server coi gói gửi-lại là nước mới và trả
   `CELL_OCCUPIED` cho một nước đi đã thành công. Gốc rễ: hướng A dedupe theo **vị trí trong lịch
   sử** (thay đổi theo thời gian), `moveId` dedupe theo **danh tính hành động** (bất biến). Kịch bản
   đầy đủ nằm trong `docs/todo/B152-*.md`. Cả Socket.IO docs, Stripe, lẫn Gambetta đều dùng định danh
   do client sinh — không nguồn nào dùng content-matching.

3. **TUYỆT ĐỐI KHÔNG bật `retries` toàn cục trong `io({...})`.** Đây là cái bẫy hấp dẫn nhất của cả
   task ("dùng cơ chế sẵn có của thư viện thay vì tự viết") và **đề xuất đầu tiên của phiên điều tra
   này đã mắc đúng bẫy đó** trước khi đọc source. Đã xác minh trên
   `node_modules/socket.io-client/build/cjs/socket.js` (4.8.3, cả 2 phía đều 4.8.3):
   - `:252` — áp dụng cho **MỌI** emit, không điều kiện "chỉ khi có ack callback"
   - `:359` — `_addToQueue()` tự nhét ack callback vào mọi packet ⇒ mọi event đều *đòi* server ack;
     handler không ack (gần như tất cả handler hiện tại) → client gửi lại `retries+1` lần ⇒ **chat bị
     gửi 4 lần**
   - `:360` + `_drainQueue()` `:392-407` — hàng đợi **tuần tự**, một event không ack sẽ **chặn đầu
     hàng đợi** cho mọi event sau nó, kể cả `game:move`

   Dự án dùng **một socket dùng chung toàn trang** (`SocketClient.shared()`, #145) nên tác hại lan
   toàn cục. Cách đúng: `.timeout(5000).emit('game:move', payload, cb)` — per-emit, đặt `flags.timeout`
   riêng cho lần emit đó (`socket.js:735` + `:291`), không đụng call site khác — rồi **tự viết đúng
   một lần retry** cho riêng `game:move`.

4. **Thứ tự emit vs ack.** Gọi `io.to(roomId).emit('game:moved')` **trước**, `ack({ok:true})` **sau**
   — để nếu ack rớt thì broadcast vẫn đã đi, và client vẫn có đường nhận nước đi qua `game:moved`
   (hai đường độc lập, tăng khả năng ít nhất một đường tới nơi).

5. **Timeout 5000ms là số khởi điểm, không phải chân lý.** Nếu chỉnh, phải dựa trên phân bố RTT đo
   được, không phải một mẫu — bài học #131 (chọn 8000ms từ 1 mẫu HAR, phải retune lên 12000ms sau khi
   `mtr` cho thấy phân bố thật). RTT hiện tại đo được ~0.5s ⇒ 5000ms là ~10x, có biên an toàn hợp lý,
   nhưng hãy kiểm lại bằng số thật. Lưu ý ngân sách xấu nhất là **10s** (2 × 5s) trước khi resync —
   đổi timeout là đổi luôn con số người chơi phải chờ.

6. **Chỉ retry khi TIMEOUT, không bao giờ retry khi ack trả `{ error }`.** Ack lỗi = gói đã tới server
   và server từ chối có chủ đích; gửi lại chỉ nhận đúng lỗi đó lần nữa và làm người chơi chờ vô ích.
   **Bảng máy trạng thái đầy đủ 6 bước nằm ở `docs/todo/B152-*.md` mục 4 — làm theo đúng bảng đó**
   (bản đầu của file này và file TODO từng mô tả bước retry không khớp nhau; bảng đó là bản chốt).

7. **Gap detection (mục 5 của TODO) có bẫy vòng lặp vô hạn.** `moveCount` bị set lại bởi **nhiều**
   đường, không riêng `game:moved`: `game:init`, `room:joined` (reconnect), `game:swap2_state`, và
   luồng undo. Nếu áp dụng kiểm tra `moveCount !== prev + 1` một cách mù cho tất cả, thì chính cái
   `game:resync` vừa gọi sẽ trả về full state với `moveCount` nhảy vọt → bị tính là gap → resync tiếp
   → **vòng lặp resync vô hạn**. Bắt buộc: gap check **chỉ** áp cho delta tuần tự của `game:moved`;
   mọi đường "nạp state đầy đủ" phải **reset baseline**, không đi qua nhánh gap.

8. **Chuỗi người dùng thấy phải qua `i18n.js` (cả `vi` VÀ `en`).** Dự án dùng `t('key')` +
   `TRANSLATIONS.vi`/`TRANSLATIONS.en` (`client/js/i18n.js`), quy ước key theo trang (`'room.*'`, xem
   `i18n.js:339+`). **Đừng hardcode tiếng Việt vào JS** — không có chuỗi người-dùng-thấy nào trong
   `client/js/` được phép nằm ngoài `i18n.js`. Thêm thiếu bản `en` = ship một nửa.

---

## Test

**Server (bắt buộc, Jest `server/tests/`):**
- ack trả `{ok:true, moveCount}` cho nước đi hợp lệ
- ack trả `{error, code}` cho nước đi bị từ chối (sai lượt, ô đã có quân, ngoài bàn, trúng tường)
- **dedupe theo `moveId`**: gửi lại đúng `moveId` đã xử lý → phát lại `movePayload`, **không** trả
  lỗi, **không** làm `moveCount` tăng lần hai
- **dedupe sống sót qua nước đi chen giữa** (chính là kịch bản đã giết hướng A): gửi A → đối thủ đi B
  → gửi lại A với **cùng `moveId`** → vẫn phải nhận diện là echo, không phải `CELL_OCCUPIED`
- dedupe **không** kích hoạt sai: `moveId` mới nhưng `(x,y)` trùng ô đã có quân → vẫn phải là lỗi
  `CELL_OCCUPIED` (đây là nước đi mới thật sự, không phải retry)
- tập `moveId` được **dọn sạch ở `handleGameEnd`** — ván mới không kế thừa id ván cũ
- **`ack` undefined** (mô phỏng client cũ) → handler không throw, `game:moved` vẫn broadcast bình
  thường
- `game:resync` trả đúng `gameState` hiện tại, chỉ gửi cho socket yêu cầu (không broadcast)
- `game:resync` khi không ở trong phòng / không có ván đang chạy → không crash

Áp dụng rule "Writing comprehensive test cases" của `CLAUDE.md`: lập bảng quyết định cho dedupe
(người gửi × vị trí × là-nước-cuối-hay-không) và dùng test tham số hoá thay vì copy-paste near-twin.

**Client:** `client/tests/` **đã có hạ tầng** — theo pattern `socket-client-connect-options.test.js`
(cùng loại: kiểm chứng shape của tham số truyền cho socket.io). ⚠️ `CLAUDE.md` hiện ghi "client-side
`client/js/` currently has none" — **thông tin đó đã cũ**, có thể cập nhật lại rule khi tiện.

Test client bắt buộc:
- `.timeout(5000)` được đặt đúng, `moveId` có mặt trong payload
- **retry dùng lại đúng `moveId` cũ**, không sinh id mới (đây là chỗ hỏng thì toàn bộ dedupe vô dụng
  mà test happy-path vẫn xanh)
- timeout lần 1 → retry; timeout lần 2 → **dừng**, gọi `game:resync` (không retry lần 3)
- ack `{ error }` → **không** retry
- **gap detection**: `moveCount` nhảy cóc (5 → 7) trên `game:moved` → gọi `game:resync`; liên tiếp
  (5 → 6) → áp dụng bình thường, **không** resync
- **gap detection không lặp vô hạn**: sau `game:resync`, full state với `moveCount` nhảy vọt phải
  **reset baseline**, không kích hoạt resync lần nữa (test này bắt đúng bẫy 7)
- chuỗi UI mới có mặt ở **cả** `TRANSLATIONS.vi` lẫn `TRANSLATIONS.en`

**Kiểm chứng test không rỗng** (bài học #131): bỏ bản sửa ra, test phải fail. Ghi số fail vào summary.

---

## Verify thật (bắt buộc, `CLAUDE.md` "Feature completion checklist")

Backend test xanh **không đủ** — đây là tính năng có mặt `client/`.
- Chạy end-to-end trong Chromium thật theo `playwright-e2e-safety` (instance **cô lập**: copy repo +
  DB tạm + cổng riêng — **tuyệt đối không** đụng DB/server thật đang có người chơi; đúng cách #131 đã
  làm).
- **Mô phỏng mất gói** để verify đường freeze thật sự được cứu — không chỉ verify happy path. Cách
  khả thi: chặn/drop frame `game:move` phía client bằng route interception hoặc tạm ngắt handler
  server, rồi kiểm tra UI có báo timeout + resync đúng không.
- Xác nhận có phản hồi UI khi timeout (không im lặng) và board tự đúng lại sau `game:resync`.

---

## Bắt buộc khi đụng `client/`

**Bump `?v=N` → `?v=N+1` toàn repo** — cả `client/*.html` lẫn **mọi `import '...?v=N'` chéo giữa các
module trong `client/js/*.js`** (không chỉ `*-entry.js`). Completion check là grep trong `CLAUDE.md`,
phải ra **đúng một** giá trị `?v=N`. Bump thiếu = tái tạo bug duplicate-module-execution (đã ship 2
lần).

---

## Git

Bug có trên cả `main` lẫn `dev` ⇒ branch off **`main`** theo `git-workflow` skill (không off `dev`).
Số TODO đã tính cả số đã dùng trên `dev`: max(dev=151, main=134) + 1 = **152**.
