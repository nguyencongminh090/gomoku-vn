# B168 — Hướng dẫn thực thi

Thiết kế đầy đủ ở `features/diagnostic-latency-page/` — **đọc `planning.md` §"Implementation
sequencing" trước**. Đây không phải task khảo sát; open question đã chốt hết. Nhưng vẫn theo
đúng thứ tự bước dưới, mỗi bước là commit riêng.

## Ràng buộc tuyệt đối

- **R2 / #167**: server là nguồn chân lý timeout DUY NHẤT. Số client (timestamp, halfRtt)
  **không bao giờ** vào công thức tính giờ — trang này chỉ *đo và hiển thị*.
- **R3 — cô lập**: không file nào một trang chính đang nạp được đổi *hành vi*. Ngoại lệ DUY
  NHẤT: `timer-sync-core.js` mới, và `room-socket.js` + `game-ui.js` chỉ *thêm import* trỏ
  vào đó — extraction thuần, có test conformance. Mọi thứ khác dưới `client/js/diag/`.
- Namespace `/diag` **không** chạm auth middleware, **không** đọc `socket.user`, **không**
  vào registry phòng, **không** dùng rate-limiter chính (bẫy: middleware socket hiện có
  `skipMiddlewares:true` — xem fix-log #147; namespace riêng phải tự lo limiter).
- **KHÔNG** siết `pingInterval`/`pingTimeout` (bẫy #147/#152). Probe là message type riêng
  `diag:ping`, cadence tự chọn (~500ms), không đụng heartbeat engine.io.

## Thứ tự bước (mỗi bước = 1 commit, `npm test` xanh trước khi sang bước sau)

1. **Tách `client/js/timer-sync-core.js`** — chép nguyên si biểu thức half-RTT EMA +
   bù-trễ-hiển-thị + clock-offset từ `room-socket.js` `tickLocal` và `game-ui.js`
   `recordMoveRtt` thành hàm thuần. Refactor 2 file phòng chơi để import. **Không đổi 1 con
   số nào.** Unit test cho core + test conformance (grep 2 file kia phải import, cấm bản sao
   biểu thức). Bump `?v=`. **Verify trình duyệt thật: đồng hồ phòng chơi hành xử y hệt
   trước** (đây là bước rủi ro nhất — regress ở đây là regress timer toàn app).
2. **`server/socket/diag-namespace.js` + `server/utils/diag-results.js`** — `diag:ping`
   echo (`process.hrtime.bigint()` + `Date.now()`), `diag:submit` → sanitize → append
   JSONL → dòng logfmt `[DiagResult]` → prune > 90 ngày. Limiter 5/IP/giờ (đếm lúc vào
   Warmup). Payload ≤ 8 KB. Jest.
3. **Solo board + bot + `TimerManager` thật** trong `/diag` — dựng `GameEngine` thật (default
   variant), player = black, bot = white chọn **ngẫu nhiên nước hợp lệ từ engine**, trả lời
   tức thì; `TimerManager(per_game)` thật áp mỗi nước; log `[DiagResult move] spent_ms
   half_rtt_ms` mỗi nước solo. Jest cho handoff + tính hợp lệ nước bot. Huỷ session (destroy
   TimerManager) ở mọi lối thoát — không để timer treo.
4. **`client/js/diag/latency-probe-session.js` (base) + `diag-probe-session.js`** — base sở
   hữu vòng lặp mẫu, tích luỹ percentile (p50/p90/p99/jitter), phát hiện gap seq → mất gói,
   điều kiện dừng (≥30 probe AND ≥8 nước). Hook `_send`/`_onEcho` cho lớp con. Unit test
   accumulator + EMA khớp core.
5. **`client/diagnostic.html` + `client/js/diag/{diag-board,diag-report,diag-entry}.js`** —
   qua `design-workflow` / `ui-ux-pro-max`: Zen Minimal, icon thay chữ, VN/EN
   (`client/js/i18n.js`), desktop + mobile. `diag-report.js` biến percentile → verdict
   `{green|yellow|red}` + key i18n. Màn kết quả: field tên + field feedback tuỳ chọn + dòng
   consent + nút gửi. CSP: không inline handler (module ngoài, như sau #155).
6. **`.claude/rules/diagnostic-page-sync.md`** — path-scoped (`paths:` gồm
   `server/managers/TimerManager.js`, `client/js/room-socket.js`, `client/js/game-ui.js`,
   `client/js/timer-sync-core.js`, `client/js/diag/**`, `client/diagnostic.html`). Nội
   dung: khi đổi cơ chế timer phòng, phải kiểm lại (a) `timer-sync-core.js` còn khớp
   `tickLocal`/`getSync` không, (b) đại lượng đo trong `diag-report.js` còn phản ánh đúng
   đường đi thật không, (c) `/diag` `TimerManager` mode còn là mặc định app không.
7. **Cập nhật `docs/todo/B167-*.md` + `docs/instruction/B167-*.md`** — thêm B168 là kênh lấy
   mẫu Bước 1 chính thức; giữ nguyên spec "server là nguồn timeout duy nhất, clientTs chỉ
   cross-check". **Không gộp task.**
8. **Verify e2e instance cô lập** (`playwright-e2e-safety`, cổng riêng, DB tạm từ
   `schema.sql`, md5 DB thật trước/sau khớp): chạy trọn ~60s, gửi kết quả, xác nhận 1 dòng
   JSONL + 1 dòng `[DiagResult]`, lượt chạy thứ 6 bị chặn, phòng/lobby thật không đổi hành
   vi. Ghi rõ khoảng trống test client trong fix-log.

## Pitfalls

- **Bước 1 làm hỏng timer toàn app** nếu extraction lệch một dấu. Diff phải cho thấy hàm
  mới == biểu thức cũ từng token. Test conformance là bắt buộc, không phải nice-to-have.
- `GameEngine` vào namespace không auth: đảm bảo không rò state — mỗi phiên 1 instance, huỷ
  khi disconnect, không đăng ký vào `RoomManager`.
- Đếm rate-limit lúc **gửi** thay vì lúc **bắt đầu** ⇒ người ta chạy 100 lần rồi không gửi.
  Đếm khi vào Warmup.
- Prune 90 ngày chạy on-write: nếu server không ghi gì trong >90 ngày thì file cũ không bị
  xoá — chấp nhận (không thêm cron cho việc này).
- `feedback`/`name` chưa sanitize control char ⇒ vỡ dòng JSONL. Strip `\r\n\t` + ký tự điều
  khiển, cap độ dài, trước khi `JSON.stringify`.
- Verdict ngưỡng (green/yellow/red) đừng chọn số tròn tuỳ hứng — lấy từ phân bố `games.moves`
  đã đo ở #154 (p50 5s, p90 24.8s, p99 50.4s) hoặc từ chính mẫu đầu trang này thu được;
  ghi rõ nguồn ngưỡng trong `diag-report.js`.

## Test

- Server Jest như liệt kê ở `docs/todo/B168-*.md` §Test.
- Bảng quyết định cho `diag-report.js` verdict: `halfRttMs p90 × {<t1, t1..t2, >t2}` →
  `{green, yellow, red}`; boundary tại đúng t1, t2.
- `diag-results` sanitize: partition {tên thường, tên 41 ký tự, tên có `\n`, tên rỗng,
  feedback 501 ký tự, feedback có control char, số `Infinity`/`NaN` trong run}.
