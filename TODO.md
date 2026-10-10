# TODO — open items only

Index. One line per item → detail `docs/todo/<CODE>-<slug>.md`. Finished items live one-per-line in
`docs/todo/DONE.md`; the long pre-compaction narratives are frozen in
`docs/archive/TODO-full-2026-10-08.md` (grep it, never read it whole).

Cheap lookups: `node scripts/track.js <N|CODE>` (index line + detail head) · `track.js open` ·
`track.js find <kw>`. Rules + templates: `.claude/rules/tracking-files.md`, `docs/templates/` (approach/traps live in the todo file; `instruction.md` is frozen legacy).

Add: detail file from `docs/templates/todo.md`, then ONE line below:
`- **#N.** title \`[Model: Haiku|Sonnet|Opus]\` — [detail](docs/todo/<CODE>-<slug>.md)`
Finish: in ONE edit, set `**Status:** ✅ DONE|FIXED|CLOSED|VERIFIED` in the detail file and MOVE the
line from here to the top of `docs/todo/DONE.md` prefixed `✅` (one-liner, no narrative — evidence goes
in the detail file / fix-log).

## Open

- **#2.** Xác nhận biến môi trường khi deploy thật `[Model: Haiku 4.5]` — [chi tiết](docs/todo/A02-xac-nhan-bien-moi-truong-khi-deploy-that.md)
- **#3.** `npm install` không chạy được trên Node 24 tại máy đánh giá `[Model: Sonnet 5]` — [chi tiết](docs/todo/A03-npm-install-khong-chay-duoc-tren-node-24-tai-may-danh-gia.md)
- **#4.** Kiểm chứng thật cho các mục "CHƯA ĐO ĐƯỢC" trong review `[Model: Sonnet 5]` — [chi tiết](docs/todo/A04-kiem-chung-that-cho-cac-muc-chua-do-duoc-trong-review.md)
- **#9.** Audit an ninh toàn bộ server + client — không phải diff, không có PR đang mở `[Model: Opus 5]` — [chi tiết](docs/todo/A09-audit-an-ninh-toan-bo-server-client-khong-phai-diff-khong.md)
- **#67.** Xác minh HSTS thực tế có tới trình duyệt qua Cloudflare Tunnel không (claim của audit gốc sai — Helmet đã bật HSTS mặc định, cần đo thật trên deploy) `[Model: Haiku 4.5]` — [chi tiết](docs/todo/A67-xac-minh-hsts-header-thuc-te-qua-cloudflare-tunnel.md)
- **#125.** Cloudflare xoá `ETag` của HTML khi tự nén lại — cần bật "Respect Strong ETags" trên dashboard Cloudflare để khôi phục; không hỏng gì hiện tại (`If-Modified-Since` vẫn trả 304), không gấp `[Model: Haiku 4.5]` — [chi tiết](docs/todo/A125-cloudflare-respect-strong-etags-cho-html.md)
- **#29.** Trần >6000 người vẫn chưa quy được nguyên nhân — sau khi sửa backlog, `[Model: Opus 5]` — [chi tiết](docs/todo/B29-tran-6000-nguoi-van-chua-quy-duoc-nguyen-nhan-sau-khi-sua.md)
- **#127.** ⚠️ (làm SAU CÙNG, cùng nhóm STRICT với #126) Gộp CSS theo trang — bỏ `lobby.css` thừa khỏi `room.html` (nạp theo lịch sử tách file, không theo trang) — cần grep xác nhận không class nào của `lobby.css` đang thật sự dùng ở `room.html` trước khi bỏ, xác minh bằng trình duyệt thật (không chỉ đoán) vì dễ vỡ layout âm thầm `[Model: Sonnet 5]` — [chi tiết](docs/todo/B127-gop-css-theo-trang-bo-lobby-css-thua-o-room.md)
  tả tổng quát — hiện tượng thật là **drawer bị thu vào rail đúng lúc modal hiện lên**, và ảnh chụp
  DevTools cho thấy `body.zen-drawer-collapsed` ở viewport ~933px CSS (`#board-area-shell` đo
  `933×773`), tức **trên** breakpoint 768px nên `game:init` không thể là nơi thêm class. Bản sửa
  #134 vẫn đúng cho đường vào của nó, không bị đảo. Chỉ có 3 nơi đụng class này
  (`room-socket.js:193-196`, `room.js:135-140`, `room.js:139-172`); `renderStartModal()` không chạm
  `body.className` ⇒ modal không phải nhân quả trực tiếp. Giả thuyết chính: **click tổng hợp**
  `chatBtn.click()` ở `room-ui.js:488-495`/`544-549` chạy vào nhánh `toggle('zen-drawer-collapsed')`
  của handler tab. **ĐÃ ĐO 2026-08-21** (Playwright, server cô lập cổng 3100/DB riêng, không đụng DB
  thật): **không tái hiện được trên code hiện tại** — Chromium 1440×900 + Firefox 933×773, đủ vòng
  đời trận (ngồi ghế → modal → bắt đầu → đầu hàng → modal về → tái đấu), `.panel-right-shell` giữ
  nguyên 340px suốt **445 frame** lấy mẫu bằng `requestAnimationFrame`, không kẹt cũng không thụt
  thoáng qua; nghi phạm `chatBtn.click()` bắt được thật (`isTrusted=false`) nhưng rơi vào nhánh
  `remove`, **bị loại**. Thí nghiệm đối chứng chỉ bỏ đúng đoạn vá #134 thì tái hiện **khớp hoàn toàn**
  ảnh chụp của người dùng (`zen-drawer-collapsed` kẹt ở 933px, shell còn 56px) ⇒ ảnh là hành vi của
  **code trước bản vá**; production đã phục vụ bản có vá (`curl .../room.js?v=139 | grep -c
  drawerBreakpoint` → 2). **ĐÃ SỬA TIẾP 2026-08-21** (`fix/tab-activation-vs-drawer-toggle` off
  `dev` — mục #136 chỉ có trên `dev`): săn tiếp tìm ra **đường thứ hai, tái hiện được** — một `?v=`
  cũ trên cross-import làm trình duyệt nạp **module instance thứ hai** của `room.js`; hai bản
  listener biến một cú **đổi tab bình thường** thành collapse ở **mọi viewport** (bản 1 gỡ class +
  set active, bản 2 thấy `alreadyActive=true` nên toggle đóng) — khớp cả 3 dấu hiệu của báo cáo gốc.
  Sửa tầng gốc: tách `activateTab()` + `window.RoomTabs.activate` (không bao giờ chạm
  `zen-drawer-collapsed`), handler click đọc ý định **trước** khi mutate, binding guard
  `body.dataset.roomTabsBound`, và 2 chỗ `chatBtn.click()` tổng hợp trong `room-ui.js` chuyển sang
  gọi ý định trực tiếp. 9 test mới (gồm 2 test nạp module 2 lần; bỏ bản sửa ra → 7/9 fail), verify
  trình duyệt thật cả 3 cử chỉ + API ở 2 trạng thái drawer, `npm test` **1213/1213**, `?v=140→141`
  `[Model: Opus 5]`. Phần "chờ hard-refresh" của vòng 1 vẫn còn giá trị nhưng không còn chặn: bản sửa
  vòng 2 độc lập với nó — [chi tiết](docs/todo/B136-drawer-thut-vao-khi-modal-hien-len.md)
  của chính nước đi rồi *hoàn* bounded vào đồng hồ (kiểu Lichess `lag`). **ĐO trước** (rule #131): nếu
  #165 đã làm người chơi hết phàn nàn thì đóng. Nếu làm: server vẫn là nguồn timeout duy nhất,
  `refund = min(measuredHalfRTT, HARD_CAP≈250ms, lag-budget/ván)`, đo lag **server-side** không tin
  client khai, `clientTs` chỉ cross-check (`Date.now()` client là wall-clock). **Bước 1 — harness đo
  đã dựng** (`feature/move-lag-measurement` + `feature/move-lag-client-rtt` off `dev`, 2026-08-28):
  `server/utils/move-lag.js`, bật bằng `LOG_MOVE_LAG=true`, mỗi nước đi log
  `[MoveLag] spent_ms half_rtt_ms client_half_rtt_ms mode ip geo`. `half_rtt_ms` = engine.io
  ping/pong server-side — **quá thưa** (1 lần/25s, không hạ `pingInterval` được: bẫy #147/#152), đo
  lần 1 (game #S83) chỉ phủ 3/17 nước ⇒ bổ sung `client_half_rtt_ms` = `RoomState.halfRttMs` (#165,
  EMA mỗi nước) gửi kèm payload `crtt`, **chỉ đối chiếu**, sanitize cứng server-side, không vào công
  thức. Client-side ⇒ bump `?v=165→166`. Test: +13 case, `npm test` 1510/1510. Chờ mẫu production
  (người chơi Mỹ/TQ) để quyết Bước 2 / đóng. **Kênh lấy mẫu Bước 1 đã dựng: trang chẩn đoán #168**
  (`/diag`, không công khai) — maintainer gửi URL, người chơi tự chạy ~60s, kết quả về
  `server/data/diag-results/*.jsonl` + dòng `[DiagResult]`; đường solo `TimerManager` thật ghi
  `spent_ms` mỗi nước. Không gộp task, spec an toàn không đổi. **Đo lần 2 (2026-08-28, 5 mẫu `/diag`
  đầu tiên):** ở cả 5 lượt `timerHandoffMs ≈ moveConfirmMs` (chênh 1–3ms) ⇒ **chặng bàn giao c→s→c
  không thêm chi phí ngoài RTT của ack — loại 1 giả thuyết**. Lượt CN/3g đo half-RTT p50 **376** /
  p90 **659**ms, `spentFloorMs.p50` **1375**ms (≈750ms transit thuần mỗi nước, ~19s/14 nước) ⇒ đạt
  ngưỡng số của Bước 2, **nhưng** mới 1 mẫu dải cao và `feedback` rỗng (chưa có vế "người chơi phàn
  nàn") ⇒ **vẫn ĐANG KHẢO SÁT**. **2 câu hỏi mở chặn Bước 2:** `OQ1` chưa có nguồn đo half-RTT
  server-side mỗi nước hợp lệ (engine.io ping 25s phủ 3/17 nước, `crtt` chỉ cross-check) — **không
  có OQ1 thì không bắt đầu Bước 2**; `OQ2` `HARD_CAP≈250ms` cần thêm mẫu để hiệu chuẩn, không nâng
  theo 1 điểm dữ liệu. Việc tiếp theo là *thu thêm mẫu*, không phải viết code. Lệch đồng hồ máy
  khách −8,4s đo được ở cùng lượt → tách thành **#170**, không gộp.
  `[Model: Sonnet 5]` — [chi tiết](docs/todo/B167-khao-sat-server-side-lag-compensation-move.md)
- **#191.** Arena mockup items needing new features (friends/challenge, country, badges, club chat/events, my-club scope) `[Model: Opus 5]` — [detail](docs/todo/B191-platform-pages-needs-new-features.md)
- **#194.** `vite build` fails: copy-classic-scripts matches a `<script src="js/...">` inside an HTML comment (diagnostic.html) `[Model: Haiku 4.5]` — [detail](docs/todo/B194-vite-build-fails-on-diagnostic-comment.md)
- **#201.** R7: Learn = puzzles (tags + levels) + forum (design first) `[Model: Opus 5]` — [detail](docs/todo/B201-learn-r7.md)
- **#203.** R7 7a: puzzles — member submissions, board editor, solve, admin review `[Model: Opus 5]` — [detail](docs/todo/B203-puzzles-7a.md)
- **#205.** R8 8a: staff roles (member/moderator/admin) + `/admin` console merging puzzle review and forum reports `[Model: Sonnet 5]` — [detail](docs/todo/B205-admin-8a-roles-console.md)
