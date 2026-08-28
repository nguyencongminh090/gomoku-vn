# B167 — (Khảo sát) Server-side lag compensation cho `game:move`

**Trạng thái:** ⬜ ĐANG KHẢO SÁT — **harness đo (Bước 1) đã dựng 2026-08-28; đã có 5 mẫu `/diag` đầu
tiên (xem "Kết quả đo lần 2"), trong đó 1 mẫu RTT cao thật. Chưa động vào công thức tính giờ.**
**Chặn Bước 2: OQ1 (nguồn đo half-RTT server-side mỗi nước) chưa có lời giải.**

**Kênh lấy mẫu Bước 1 (đã dựng, 2026-08-28):** trang chẩn đoán **#168** — `docs/todo/B168-*.md`, code
ở `server/socket/diag-namespace.js` + `server/socket/diag-session.js` + `client/diagnostic.html`.
URL `/diag` không công khai (không link ở nav/lobby/footer); maintainer gửi trực tiếp cho người chơi
Mỹ/TQ. Mỗi lần người chơi gửi → **1 dòng JSONL** `server/data/diag-results/YYYY-MM-DD.jsonl` (nguồn
chân lý) + **1 dòng** logfmt `msg="[DiagResult]"` (tiện grep, không phụ thuộc). Đường solo board
dùng `GameEngine` + `TimerManager` **thật** (mode `per_game`), ghi thêm `msg="[DiagResult move]"`
mỗi nước với `spent_ms` (mốc monotonic) + `black_s`/`white_s`. So `spent_ms` sàn (nước think-time ~0)
với half-RTT: cỡ-drift → #165 đủ, đóng B167; cỡ-RTT thật → Bước 2.

**Không gộp task:** #167 vẫn là quyết định "có làm bounded refund không"; #168 là dụng cụ đo. Spec an
toàn dưới đây (server là nguồn timeout duy nhất, clientTs chỉ cross-check) **không đổi** — trang #168
chỉ *đo và hiển thị*, không có giá trị client nào của nó vào công thức tính giờ.

**Severity:** Low — B165 đã xử lý phần *hiển thị* (người chơi hết thấy nhảy). B167 chỉ thêm phần
*công bằng giờ thật*: người chơi không bị trừ giây cho quãng nước đi kẹt trên đường mạng.
**Platform:** Mọi nền tảng, rõ nhất ở kết nối 150–300ms+ (báo cáo gốc: người chơi TQ #155, người
chơi Mỹ + VPN #165).
**Reported by:** Thảo luận architect 2026-08-28 — người dùng hỏi về "client gửi timestamp lúc click".

---

## Bước 1 — ĐO trước (bắt buộc, theo rule #131 "đừng chọn số tròn")

- Log `spent = serverRecv − turnStart` và `measuredHalfRTT` (từ `io.engine` ping/pong) cho một mẫu
  nước đi thật trên domain production.
- Nếu mất mát chủ yếu cỡ-drift (giây, do transit delay) → **B165 là đủ**, đóng B167.
- Nếu mất mát cỡ-RTT thật (chục–trăm ms) và người chơi phàn nàn bị trừ giờ → sang bước 2.

### Harness đã dựng — `feature/move-lag-measurement` off `dev` (2026-08-28)

- **Bật:** đặt `LOG_MOVE_LAG=true` (hoặc `1`) trong môi trường server production. Tắt mặc định —
  không có flag thì toàn bộ module `server/utils/move-lag.js` trơ (không ghi map, không log, không
  gắn listener engine.io). Cùng quy ước với `LOG_HTTP` (#164).
- **Mỗi nước đi được chấp nhận** → 1 dòng logfmt `msg="[MoveLag]"` với:
  - `spent_ms` — thời gian thực (wall) đồng hồ người đi chạy trên server, đo bằng mốc **monotonic**
    `process.hrtime.bigint()` đặt lúc đổi lượt (không dùng `Date.now`). Gồm think-time + chân
    **tải-lên** nước đi.
  - `half_rtt_ms` — nửa RTT của socket đó, đo **server-side** từ gói `ping` server gửi tới `pong`
    client trả (engine.io protocol v4). Không cần client hợp tác, không thêm packet type — khác
    #165 nơi client không đọc được vì client không khởi xướng heartbeat. **Key bị bỏ hẳn nếu chưa
    có số đo** (xem hạn chế bên dưới).
  - `client_half_rtt_ms` — số `halfRttMs` client tự giữ (EMA từ ack `game:move`, #165), gửi kèm
    payload `game:move` (trường `crtt`). **Chỉ để đối chiếu** — sanitize cứng server-side (số hữu
    hạn 0–60000), **KHÔNG bao giờ vào công thức timeout**. Xem bổ sung `feature/move-lag-client-rtt`
    bên dưới.
  - `mode` (`per_game`/`blitz`/`per_move`), `room`, `user`, `ip`, `geo` (nhãn Cloudflare #164).
- **Đọc kết quả:** `grep '\[MoveLag\]' <log> | ...` — ưu tiên các dòng `geo` ngoài VN / RTT cao
  (người chơi Mỹ/TQ). So RTT với phần lẻ giây của `spent_ms`:
  - RTT chỉ vài chục ms, `spent_ms` sát số nguyên giây kỳ vọng → mất mát là **drift**,
    #165 đã đủ → **đóng B167 "Đã đóng: không cần"**.
  - RTT cỡ 150–300ms+ và người chơi phàn nàn → phần tải-lên (`≈ half_rtt`) là giờ thật
    bị trừ oan → **sang Bước 2** (hoàn bounded).
- **Gỡ harness:** xoá `server/utils/move-lag.js` + `server/tests/move-lag.test.js` + call site
  `moveLag.*` trong `server/socket/handlers/GameHandler.js` + trường `crtt` trong
  `client/js/game-ui.js` `sendMove` + 2 test `crtt` trong `client/tests/game-move-ack-retry-resync.test.js`
  (tất cả có comment `TEMP — TODO.md #167`).

### Kết quả đo lần 1 — game #S83, 2 người, LAN/cùng IP VN (2026-08-28)

- Harness chạy đúng: **17/17 nước** log ra dòng `[MoveLag]`.
- `spent_ms` sàn ≈ **239–265ms** ở các nước bấm nhanh (think-time ~0) — phần overhead thuần
  (broadcast đổi lượt tới client + nước đi bay ngược lên).
- **`half_rtt_ms` chỉ có ở 3/17 dòng** (đều `=164`, cùng 1 người). **Nguyên nhân gốc:** engine.io
  protocol v4 gửi `ping` server→client **1 lần / `pingInterval` = 25s** (mặc định, không đổi — hạ
  `pingInterval` là bẫy #147/#152). Ván dài 18s ⇒ hầu hết nước chưa kịp có chu kỳ ping/pong nào.
  Nguồn ping/pong mà hướng dẫn chỉ định **quá thưa để phủ một ván bình thường.**

### Bổ sung — `feature/move-lag-client-rtt` off `dev` (2026-08-28)

Vá khoảng trống phủ half-RTT: client đã có sẵn `RoomState.halfRttMs` (EMA từ ack `game:move`, cập
nhật **mỗi nước**, tốt hơn ping/pong 25s). `sendMove` gắn nó vào payload (`crtt`), server log thành
`client_half_rtt_ms` **chỉ để đối chiếu** với `half_rtt_ms` (nguồn server, khi có). Hướng dẫn cho
phép giá trị client cho cross-check ("`clientTs` chỉ cross-check"). Nếu 2 số khớp trên các dòng có
cả hai → tin `client_half_rtt_ms` cho phần còn lại. Sanitize server-side: bỏ nếu không phải số hữu
hạn 0–60000.

- Client-side ⇒ **bump `?v=165→166`** toàn repo (grep đúng 1 giá trị).
- Test: `move-lag.test.js` +11 case (`client_half_rtt_ms` sanitize) = 37 case;
  `game-move-ack-retry-resync.test.js` +2 case (`crtt` khi chưa/đã có estimate, đi kèm retry).
  `npm test` **1510/1510**.
- Cũng sửa: `half_rtt_ms=`/`client_half_rtt_ms=` rỗng → **bỏ hẳn key** khi chưa đo được (dễ đếm
  coverage khi phân tích).

### Kết quả đo lần 2 — mẫu `/diag` production, 5 lượt (2026-08-28)

Nguồn: `server/data/diag-results/2026-08-28.jsonl`, 5 dòng, đều `assetVersion 168`.

| # | geo / mạng | half-RTT p50 / p90 | `spentFloorMs` p50 | `moveConfirm` p50 | `timerHandoff` p50 | verdict (C/K/S) |
|---|---|---|---|---|---|---|
| 1 | VN / 4g | 54 / 65 | 448 | 112 | 111 | 🟢🟢🟢 |
| 2 | VN / 4g | 58 / 89 | 238 | 119 | 118 | 🟢🟢🟢 |
| 3 | VN / — | 53 / 56 | 145 | 105 | 104 | 🟢🟢🟢 |
| 4 | VN / — | 52 / 54 | 606 | 104 | 103 | 🟢🟢🟢 |
| 5 | **CN / 3g** | **376 / 659** | **1375** | 891 | 750 | 🔴🔴🟡 |

**Ba kết luận cho quyết định #167:**

1. **Chặng bàn giao c→s→c KHÔNG phải thủ phạm — loại bỏ được một giả thuyết.** Ở cả 5 lượt
   `timerHandoffMs ≈ moveConfirmMs` (chênh 1–3 ms). `diag:timer` phản ánh nước bot quay về gần như
   cùng lúc với ack ⇒ không có chi phí bàn giao *thêm* ngoài RTT của chính ack. (Lượt 5 có
   `handoff.p50` 750 < `confirm.p50` 891, nghịch với 4 lượt kia — nhưng với jitter ~200 ms và chỉ 14
   nước, p50 hai chuỗi lấy mẫu các nước khác nhau. Là nhiễu do N nhỏ, **không** phải bằng chứng bàn
   giao nhanh hơn ack.)
2. **Điều kiện sang Bước 2 đã được thoả về mặt số đo.** Tiêu chí Bước 1 ghi "RTT cỡ 150–300ms+ ⇒ sang
   Bước 2". Lượt 5 đo half-RTT p50 **376 ms**, p90 **659 ms**. `spentFloorMs.p50 = 1375 ms` bị tính
   cho *mỗi* nước dù người chơi bấm gần như tức thì và bot trả lời ngay — trong đó ~750 ms là transit
   thuần. Qua 14 nước ≈ **~19 giây** bị trừ mà người chơi không thực sự "tiêu".
   **Nhưng:** mới **1 mẫu duy nhất** ở dải cao, và **chưa có phàn nàn trực tiếp kèm số đo** từ chính
   người chơi đó (trường `feedback` rỗng). Tiêu chí gốc là "RTT cao **và** người chơi phàn nàn bị
   trừ giờ" — vế sau chưa có. **Chưa đủ để tự động mở Bước 2.**
3. **Lệch đồng hồ máy khách là vector độc lập, không thuộc #167.** Lượt 5 đo `clockOffsetMs.p50 =
   −8407,75 ms`. Phòng chơi đã bù qua `serverNow()`; chỗ chưa bù tách thành **#170**. Không gộp vào
   đây — #167 là giờ thật phía server, #170 là hiển thị phía client.

### Hai câu hỏi mở phải chốt TRƯỚC khi viết code Bước 2

- **OQ1 — Server đo `measuredHalfRTT` mỗi nước bằng cách nào?** Spec Bước 2 yêu cầu đo **server-side**,
  không tin số client khai. Nhưng đo lần 1 đã chứng minh nguồn được chỉ định (engine.io ping/pong)
  phủ **3/17 nước** vì `pingInterval = 25s`, và hạ nó là bẫy #147/#152. `client_half_rtt_ms` (`crtt`)
  chỉ được dùng để đối chiếu. ⇒ **Chưa có nguồn hợp lệ để nuôi công thức refund.** Phải quyết một
  hướng trước: (a) server đóng dấu timestamp vào ack `game:move` và tự đo vòng về server-side; (b)
  một probe nhẹ riêng theo đúng kiểu `diag:ping`/`diag:pong` của #168 (đã chạy được, phủ mỗi ~500ms);
  hay (c) hướng khác. **Không có OQ1 thì Bước 2 không thể bắt đầu.**
- **OQ2 — `HARD_CAP ≈ 250ms` có còn đúng không?** Con số 250 dẫn xuất từ giả định "dân số bị ảnh
  hưởng ~500 ms round trip" (chú thích `MOVE_ACK_TIMEOUT_MS`, #152/#165). Số đo thật đầu tiên: half-RTT
  p50 **376**, p90 **659** ⇒ cap 250 ms vẫn để lại ~130–400 ms/nước bị trừ oan. Theo rule "đừng chọn
  số tròn", **cần thêm vài lượt `/diag` từ người chơi Mỹ/TQ** rồi mới hiệu chuẩn lại, thay vì nâng cap
  theo cảm tính từ 1 điểm dữ liệu.

**Trạng thái sau lần đo 2: vẫn ĐANG KHẢO SÁT.** Hành động tiếp theo là *thu thêm mẫu* + chốt OQ1,
không phải viết code.

## Bước 2 — Nếu làm: spec bắt buộc (an toàn)

**Server vẫn là nguồn chân lý duy nhất cho timeout.** `clientTs` chỉ để cross-check, KHÔNG vào công
thức tính giờ (`Date.now()` client là wall-clock — user/NTP chỉnh được).

| Ràng buộc | Cách làm |
|---|---|
| Mốc thời gian | Server tự ghi `turnStart` bằng `process.hrtime`/monotonic — không dùng `Date.now` |
| Công thức | `spent = serverRecv − turnStart`; `refund = min(measuredHalfRTT, HARD_CAP≈250ms, remainingLagBudget)`; `spent -= refund` |
| Đo lag | Từ socket.io ping/pong **server-side**, KHÔNG từ số client khai |
| Chặn "suy nghĩ vô hạn" | Bắt buộc clamp; `refund` không bao giờ vượt `HARD_CAP` |
| Chặn farm-lag (giả latency cao) | **Lag-budget/ván** (vd tổng refund ≤ 10s như Lichess); hết budget thì refund = 0 |
| Monotonic | Từ chối nước có `clientTs` lùi so với nước trước (nếu dùng `clientTs` để cross-check) |

**Thiệt hại tối đa nếu làm đúng** = `HARD_CAP × số nước` ≈ vài giây/ván, và đó là hoàn lại độ trễ
người chơi **đã thực trả** — chấp nhận được. Rủi ro chỉ xuất hiện khi **quên clamp** hoặc **tin số
client khai thay vì đo**.

---

## Liên quan

- **#165** — tiền đề; phần hiển thị. B167 là phần "giờ thật", tách hẳn (khác tầng, khác rủi ro).
- **#10 / TimerManager** — `getSync`/`applyMove`; điểm chèn refund là trong `startTimerForGame`
  `onTimeout`-path và `switchTurn` của `TimerManager`.
- **#169** — cùng dữ liệu `/diag`, nhưng là tầng **hiển thị** (đồng hồ giật/nhảy do jitter). Làm được
  ngay, không phụ thuộc #167. Nếu #169 làm người chơi hết phàn nàn thì áp lực làm Bước 2 giảm hẳn —
  giống hệt vai trò #165 đã đóng ở lần trước.
- **#170** — lệch đồng hồ máy khách (`Date.now()` thô ở `readyDeadline`). Tách riêng, không phải #167.
- Rule CLAUDE.md "Security findings: verify against current code" + "Root-cause diagnosis".
