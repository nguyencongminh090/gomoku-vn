# B168 — Trang chẩn đoán độ trễ (người chơi tự đo, không cần vào ván thật)

**Trạng thái:** ✅ ĐÃ XONG (2026-08-28) — 8 bước tuần tự trên `feature/diag-latency-page`
off `dev`, mỗi bước 1 commit, `npm test` xanh giữa các bước (**1831/1831**, +320 so với
1510 trước #168). Verify **cả 2 tầng**: client live trong bước 5 (Playwright desktop+mobile),
backend cô lập trong bước 8. Chờ merge vào `dev` theo `git-workflow`.

**Đã dựng:**
- `client/js/timer-sync-core.js` (tách nguyên si khỏi `room-socket.js`/`game-ui.js`, 1 sai
  lệch có chủ đích: bỏ đọc `Date.now()` 2 lần — xem header file). Test parity + conformance.
- `server/socket/diag-namespace.js` + `server/utils/diag-results.js` + `server/socket/diag-session.js`
  — `/diag` cô lập hoàn toàn (không `io.use`, không `nsp.use()`, limiter riêng 5/IP/giờ tính
  lúc **start**), JSONL nguồn chân lý + prune 90 ngày, `GameEngine`/`TimerManager` thật/phiên.
- `client/js/diag/{latency-probe-session,diag-probe-session,diag-report,diag-board,diag-entry}.js`
  + `client/diagnostic.html` + `client/css/diag.css` — Zen Minimal, VN/EN, ngưỡng verdict
  **suy ra** từ tick phòng 1000ms + RTT ~500ms đã đo (#152/#165), không phải số tròn tuỳ hứng.
- `.claude/rules/diagnostic-page-sync.md` path-scoped.
- Docs #167 cập nhật = kênh lấy mẫu Bước 1 (spec an toàn không đổi, không gộp task).
- `?v=166→168` toàn repo (167 là bump trung gian bước 1).

**Khoảng trống test client (ghi rõ theo yêu cầu):** module thuần đủ test Node
(`timer-sync-core` / `latency-probe-session` / `diag-probe-session` / `diag-report`) +
`diag-i18n-coverage` / `diag-sprite-icons` jsdom. **`diag-entry.js` (state machine 4 màn +
vòng đời socket) và `diag-board.js` (dựng `BoardRenderer`, cần canvas) KHÔNG có test tự
động** — chỉ verify bằng Playwright thật. Harness jsdom cho `diag-entry.js` (stub socket,
như các suite phòng) là follow-up hiển nhiên nếu trang có thêm logic.

Fix-log: [2026-08-28-todo-168-diagnostic-latency-page.md](../fix-log/2026-08-28-todo-168-diagnostic-latency-page.md).

---

### Thiết kế gốc (đã chốt qua `features/diagnostic-latency-page/`)

**Severity:** Low (công cụ đo, không sửa bug). **Đòn bẩy cao:** gỡ điểm nghẽn "chờ mẫu
production" của #167 và lấp HONESTY NOTE của #165 (`d` production chưa đo được bằng số).

**Platform:** Mọi nền — mục tiêu là người chơi RTT cao (Mỹ+VPN #165, TQ #155).

**Reported by:** Thảo luận architect 2026-08-28 — người dùng đề xuất "trang cho user tự test
latency/speed mà không phải chơi ván thật".

---

## Mục tiêu

URL **không công khai** (`/diag`) — maintainer gửi trực tiếp cho người báo cáo. Đo, **không
chơi ván xếp hạng**:

1. **Latency** — half-RTT p50/p90/p99/jitter, lệch đồng hồ + drift, mất gói.
2. **Board + Action** — click → in quân optimistic (client), click → server xác nhận.
3. **Timer tick c→s→c** — nước mình → server áp vào `TimerManager` thật → bot đi ngẫu nhiên
   ngay → `timer:tick` về. Đây là số phân định #167: mất giờ cỡ-drift (→#165 đủ) hay
   cỡ-RTT (→#167 Bước 2).

Kết quả hiện dạng verdict + icon (không bảng ms) cho người **không rành kỹ thuật**. Người
chơi gõ tên hiển thị + (tuỳ chọn) phản hồi văn bản, bấm 1 nút gửi về server.

## Chốt thiết kế (2026-08-28)

| # | Chốt |
|---|---|
| Auth | Không đăng nhập. Namespace `/diag` riêng, bỏ qua auth middleware, cô lập hoàn toàn khỏi state socket đã xác thực + rate-limiter chính. |
| Server | **Dedicated** — nhấn mạnh đo. Solo board. Server dựng `GameEngine` + `TimerManager` **thật** mỗi phiên. |
| Bot | `GameEngine` thật sinh nước hợp lệ, chọn ngẫu nhiên, trả lời **tức thì** để đồng hồ lật lượt. |
| Timer mode | Hard-code `per_game` (mặc định app). Không có bộ chọn mode. |
| Board | Dùng `BoardRenderer` + `optimisticStone` (#153) **thật**, không viết lại. |
| Đo timer | `timer-sync-core.js` **mới** (thuần) — tách `halfRttEma`/`compensatedDisplay`/`clockOffset` ra khỏi `room-socket.js` `tickLocal` + `game-ui.js` `recordMoveRtt`; code phòng chơi *import* module này. Extraction, **không đổi logic**, có test conformance. |
| Tổ chức client | Lớp trừu tượng `LatencyProbeSession` (vòng lặp mẫu / EMA / percentile / điều kiện dừng) → lớp con `DiagProbeSession` (`diag:ping`/`diag:pong`). Chừa seam cho `RoomProbeSession` tương lai, **không** dựng bây giờ. Tất cả dưới `client/js/diag/`. |
| Lưu kết quả | **JSONL là nguồn chân lý**: `server/data/diag-results/YYYY-MM-DD.jsonl` (gitignore), 1 dòng/lần gửi. Kèm 1 dòng logfmt `msg="[DiagResult]"` cho pipeline grep (tiện, không phụ thuộc). Prune file > **90 ngày** khi ghi (bắt buộc). |
| Feedback | 1 field văn bản tự do (tuỳ chọn) trên màn kết quả, sanitize, ≤ 500 ký tự, lưu `feedback` trong JSONL. |
| Chống lạm dụng | **5 lượt chạy / IP / giờ** (đếm khi vào Warmup, không đếm lúc gửi); 1 phiên/socket; payload ≤ 8 KB; limiter riêng của `/diag`. |
| Riêng tư | 1 dòng consent trước khi gửi. Lưu: tên đã sanitize, IP (`getClientIp()`/CF-Connecting-IP), nhãn geo CF (#164), snapshot `navigator.connection`, UA, thống kê tổng hợp. Retention 90 ngày. |
| Khám phá | URL không công khai. Không link ở nav / lobby / footer login. |
| UI | Zen Minimal, layout theo skill `ui-ux-pro-max`, **icon thay chữ**. Desktop + mobile. VN + EN qua `client/js/i18n.js`. |
| Rule đồng bộ | `.claude/rules/diagnostic-page-sync.md` path-scoped (nạp khi sửa `TimerManager.js`, `room-socket.js`, `game-ui.js`, `timer-sync-core.js`, `client/js/diag/**`). |

## Cấu trúc JSONL

Xem `features/diagnostic-latency-page/planning.md` §"Submitted-result JSONL shape" (khối
JSON đầy đủ). Trường: `id, ts, name, feedback, ip, geo, ua, net, client, run{halfRttMs,
clockOffsetMs, packetLossPct, inputPaintMs, moveConfirmMs, timerHandoffMs, spentFloorMs},
verdict`.

## Quan hệ với #167

Trang này là **kênh lấy mẫu Bước 1 chính thức** cho #167 — không gộp task. #167 vẫn là quyết
định "có làm bounded refund không"; trang này là dụng cụ đo. Sau khi làm xong B168, cập nhật
`docs/todo/B167-*.md` + `docs/instruction/B167-*.md` ghi nhận kênh này.

## Ngoài phạm vi

- Turn-watchdog / resync (#152/#154) — trang chỉ đo, không test độ bền.
- `tournament-match.js` — không đụng (đã hoãn ở #165/#166). Sau Bước 1, đây là bản sao **duy
  nhất còn lại** của maths đồng hồ (`room-socket.js`/`game-ui.js` đã gọi `timer-sync-core.js`),
  và `applyTimerSync()` của nó vẫn đọc `Date.now()` 2 lần (nhánh dự phòng ra `-1` thay vì `0`, 1ms
  skew ảo). **Biết nhưng cố ý không đụng** — người dùng chốt 2026-08-28 "do not touch tournament
  for now" (từng stack thành B169, nay gỡ). Không có task; nếu revisit thì tạo mục mới.
- Diagnostic trong phòng xếp hạng thật (`RoomProbeSession`) — chỉ chừa seam.
- UI xem kết quả — script đọc `server/scripts/diag-results.js` là đủ.

## Test

- Server Jest: `diag-namespace` (echo, limiter tại lượt thứ 6, payload cap, cô lập), 
  `diag-results` (sanitize tên/feedback, drop số vô hạn, prune 90 ngày), bot sinh nước hợp
  lệ qua `GameEngine`, handoff `TimerManager` (spent_ms monotonic).
- `timer-sync-core.js`: unit test + test conformance (grep-assert `room-socket.js` +
  `game-ui.js` import, không có bản sao logic).
- `client/js/diag/**`: chưa có runner — verify qua instance **cô lập**
  (`playwright-e2e-safety`): chạy hết ~60s, gửi, xác nhận JSONL + log line, chặn lượt 6,
  xác nhận phòng/trang chính không bị ảnh hưởng. **Nói rõ khoảng trống test client.**

## Bump `?v=N`

Có file `client/css` + `client/js` mới ⇒ bump `?v=N→N+1` toàn repo, grep verify đúng 1 giá
trị (theo CLAUDE.md). Trang `diagnostic.html` tham gia `?v=` chung (không phải ngoại lệ
mockup).
