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
- **A1.** TLS/HTTPS (review 3.0) — [chi tiết](docs/instruction/A1-tls-https-review-3-0.md)
- **A4.** Đo lại timing attack sau khi áp Phần B #6 — [chi tiết](docs/instruction/A4-do-lai-timing-attack-sau-khi-ap-phan-b-6.md)
- **A6.** Kiến trúc scale quá 1 tiến trình (từ stress test 2026-08-02) — [chi tiết](docs/instruction/A6-kien-truc-scale-qua-1-tien-trinh-tu-stress-test-2026-08-02.md)
- **A7.** Đo lại tải bằng harness đa tiến trình (từ stress test 2026-08-02) — [chi tiết](docs/instruction/A7-do-lai-tai-bang-harness-da-tien-trinh-tu-stress-test-2026.md)
- **A8.** Quan sát heap/GC của server đang chạy (từ stress test 2026-08-02) — [chi tiết](docs/instruction/A8-quan-sat-heap-gc-cua-server-dang-chay-tu-stress-test-2026.md)

## Phần B (sửa bằng code) — hướng dẫn cho từng mục
- **B1.** Restart-hang else branch (review 5.1) — [chi tiết](docs/instruction/B1-restart-hang-else-branch-review-5-1.md)
- **B2.** Chat sanitize (review 3.5) — [chi tiết](docs/instruction/B2-chat-sanitize-review-3-5.md)
- **B3.** `escapeAttr` (review 3.7) — [chi tiết](docs/instruction/B3-escapeattr-review-3-7.md)
- **B4.** `SELECT *` + rate limit `/api/games` (review 6.4) — [chi tiết](docs/instruction/B4-select-rate-limit-api-games-review-6-4.md)
- **B6.** Timing attack — dummy compare (review 3.6) — [chi tiết](docs/instruction/B6-timing-attack-dummy-compare-review-3-6.md)
- **B7.** Room quota theo IP/tài khoản (review 3.2) — [chi tiết](docs/instruction/B7-room-quota-theo-ip-tai-khoan-review-3-2.md)
- **B8.** Bỏ `settings` khỏi `room:updated` (review 4.2) — [chi tiết](docs/instruction/B8-bo-settings-khoi-room-updated-review-4-2.md)
- **B9.** `lobby:update` → delta (review 4.1/13 + báo cáo kiểm chứng `3da53dd`) — [chi tiết](docs/instruction/B9-lobby-update-delta-review-4-1-13-bao-cao-kiem-chung-3da53dd.md)
- **B10.** `timer:tick` → `deadline` (review 4.3) — [chi tiết](docs/instruction/B10-timer-tick-deadline-review-4-3.md)
- **B11.** Viết lại test đã bị xoá cho 6 fix (phát hiện từ báo cáo kiểm chứng) — [chi tiết](docs/instruction/B11-viet-lai-test-da-bi-xoa-cho-6-fix-phat-hien-tu-bao-cao-kiem.md)
- **B12.** Thứ tự trong `cancelDisconnectGrace` (phát hiện từ báo cáo kiểm chứng) — [chi tiết](docs/instruction/B12-thu-tu-trong-canceldisconnectgrace-phat-hien-tu-bao-cao.md)
- **B18.** Tạo phòng "flash" sang room.html rồi bị đá về lobby khi đụng quota IP (mục 7) — [chi tiết](docs/instruction/B18-tao-phong-flash-sang-room-html-roi-bi-da-ve-lobby-khi-dung.md)
- **B19–B26.** Nhóm phát hiện từ stress test (2026-08-02) — [chi tiết](docs/instruction/B19-B26-nhom-phat-hien-tu-stress-test-2026-08-02.md)
- **B28.** (thứ tự transport — xem TODO.md #28) — [chi tiết](docs/instruction/B28-thu-tu-transport-xem-todo-md-28.md)
- **B29.** (trần >6000 người, phiên điều tra tiếp — xem TODO.md #29) — [chi tiết](docs/instruction/B29-tran-6000-nguoi-phien-dieu-tra-tiep-xem-todo-md-29.md)
- **B32.** Giới hạn ký tự cho `displayName` (từ security review toàn bộ codebase, 2026-08-03) — [chi tiết](docs/instruction/B32-gioi-han-ky-tu-cho-displayname-tu-security-review-toan-bo.md)
- **B33.** Kiểm tra tư cách người chơi khi chấp nhận/từ chối đề nghị hoà (từ recheck security review, 2026-08-03) — [chi tiết](docs/instruction/B33-kiem-tra-tu-cach-nguoi-choi-khi-chap-nhan-tu-choi-de-nghi.md)
- **B34.** Kiểm tra tư cách người chơi khi chấp nhận/từ chối yêu cầu cộng giờ (từ recheck security review, 2026-08-03) — [chi tiết](docs/instruction/B34-kiem-tra-tu-cach-nguoi-choi-khi-chap-nhan-tu-choi-yeu-cau.md)
- **B35.** `#start-modal` chồng hình lên `#game-overlay` (từ báo cáo người dùng, 2026-08-03) — [chi tiết](docs/instruction/B35-start-modal-chong-hinh-len-game-overlay-tu-bao-cao-nguoi.md)
- **B36.** Redesign Start Modal + bỏ Game-End Modal (từ yêu cầu người dùng, 2026-08-04) — [chi tiết](docs/instruction/B36-redesign-start-modal-bo-game-end-modal-tu-yeu-cau-nguoi.md)
- **B37.** Timer phải chạy ngay từ lúc bắt đầu ván Swap2, không ngoại lệ (từ báo cáo người dùng, 2026-08-04) — [chi tiết](docs/instruction/B37-timer-phai-chay-ngay-tu-luc-bat-dau-van-swap2-khong-ngoai.md)
- **§39.** Guest/spectator reconnect thiếu grace period (TODO.md #39) — [chi tiết](docs/instruction/S39-guest-spectator-reconnect-thieu-grace-period-todo-md-39.md)
- **§40.** `room.html` không `?id=` freeze ở overlay "Đang vào phòng" (TODO.md #40) — [chi tiết](docs/instruction/S40-room-html-khong-id-freeze-o-overlay-dang-vao-phong-todo-md.md)
- **A10.** `cloudflared` với `X-Forwarded-For` thật — chuyển sang §44 (review 12.6) — [chi tiết](docs/instruction/A10-cloudflared-voi-x-forwarded-for-that-chuyen-sang-44-review.md)
- **A11.** `permessage-deflate` (review 8.5, TODO.md #11) — [chi tiết](docs/instruction/A11-permessage-deflate-review-8-5-todo-md-11.md)
- **§41.** Debounce `lobby:online_users` gần vô dụng ở nhịp reconnect thật (review 12.5, TODO.md #41) — [chi tiết](docs/instruction/S41-debounce-lobby-online-users-gan-vo-dung-o-nhip-reconnect.md)
- **§42.** `cancelEmptyRoomGrace` thiếu test cho đúng kịch bản mutation (review 12.5, TODO.md #42) — [chi tiết](docs/instruction/S42-cancelemptyroomgrace-thieu-test-cho-dung-kich-ban-mutation.md)
- **§43.** Grace 20s + `MAX_ROOMS_PER_IP` khoá nhầm người dùng chung IP (review 12.5, TODO.md #43) — [chi tiết](docs/instruction/S43-grace-20s-max-rooms-per-ip-khoa-nham-nguoi-dung-chung-ip.md)
- **§44.** `getClientIp()` ưu tiên `CF-Connecting-IP` (review 12.6, TODO.md #44) — [chi tiết](docs/instruction/S44-getclientip-uu-tien-cf-connecting-ip-review-12-6-todo-md-44.md)
- **B45.** Text không dịch / hardcode tiếng Việt ở English mode (báo cáo người dùng, TODO.md #45) — [chi tiết](docs/instruction/B45-text-khong-dich-hardcode-tieng-viet-khi-o-che-do-english.md)
- **B48.** Tournament (Tables & Tournaments) — từ yêu cầu người dùng, thảo luận + blueprint UI (TODO.md #48) — [chi tiết](docs/instruction/B48-tournament-tables-tournaments-tu-yeu-cau-nguoi-dung.md)
- **B49.** Bàn cờ trận đấu giải đấu quá nhỏ / thiếu nhất quán — từ báo cáo người dùng kèm ảnh chụp màn hình (TODO.md #49) — [chi tiết](docs/instruction/B49-ban-co-trong-tran-dau-giai-dau-qua-nho-thieu-nhat-quan.md)
- **B50.** Cặp đấu chơi nhiều ván (game series) thay vì một ván — từ yêu cầu người dùng, thảo luận qua `features/tournament-match-series/` (TODO.md #50) — [chi tiết](docs/instruction/B50-cho-phep-mot-cap-dau-choi-nhieu-van-thay-vi-mot-van.md)
- **B51.** Quy tắc cache-bust bỏ sót cross-module import — từ báo cáo người dùng "đăng nhập thiết bị khác" đá nhầm (TODO.md #51) — [chi tiết](docs/instruction/B51-cache-bust-quy-tac-bo-sot-cross-module-import.md)
- **B52.** Trang trận đấu giải đấu UX kém — mất cân bằng bố cục dù bàn cờ đã to hơn (TODO.md #52) — [chi tiết](docs/instruction/B52-trang-tran-dau-giai-dau-ux-kem-du-bang-co-da-to-mat-can-bang.md)
- **B57.** Trận đấu giải đấu thêm Cầu hoà và Xin cộng giờ như phòng thường — từ yêu cầu người dùng (TODO.md #57) — [chi tiết](docs/instruction/B57-tournament-match-them-draw-offer-va-time-request-nhu-phong-thuong.md)
- **B59.** Organizer huỷ giải đấu bất cứ lúc nào — thảo luận qua `features/tournament-cancel/` (TODO.md #59) — [chi tiết](docs/instruction/B59-to-chuc-huy-giai-dau-bat-cu-luc-nao.md)
- **B60.** Khách xem trận đấu giải đấu qua Live Matches Browser — thảo luận qua `features/tournament-live-matches-browser/` (TODO.md #60) — [chi tiết](docs/instruction/B60-khach-xem-tran-dau-giai-dau-qua-live-matches-browser.md)
- **B61.** `.match-clocks` quá sát `#match-meta` trên PC — từ review nhanh UI desktop (TODO.md #61) — [chi tiết](docs/instruction/B61-match-clocks-qua-sat-detail-header-meta-tournament-match-pc.md)
- **B62.** Check-in Sẵn sàng giữa các ván trong series nên tái dùng Start Modal ngay trong `tournament-match.html` — từ yêu cầu người dùng (TODO.md #62) — [chi tiết](docs/instruction/B62-series-ready-checkin-tai-cho-trong-tournament-match-thay-vi-quay-lai-trang.md)
- **B63.** Standings nên cộng dồn điểm thật (`seriesScore`) thay vì 1 điểm/pairing thắng — từ báo cáo người dùng (TODO.md #63) — [chi tiết](docs/instruction/B63-standings-score-nen-cong-don-tung-van-thay-vi-1-diem-moi-pairing.md)
- **B64.** Round Robin: Cross Table thay bảng Standings dạng danh sách — tiếp nối #63 (TODO.md #64) — [chi tiết](docs/instruction/B64-round-robin-cross-table-thay-danh-sach-standings.md)
- **B65.** CSP + third-party script — bảo vệ JWT bearer trong `localStorage` (security review Network, TODO.md #65) — [chi tiết](docs/instruction/B65-csp-va-third-party-script-bao-ve-jwt-localstorage.md)
- **B66.** `Cache-Control: no-store` trên response `/api/auth/*` — chỉ sửa `auth.js`, không áp toàn cục (audit network, TODO.md #66) — [chi tiết](docs/instruction/B66-cache-control-no-store-tren-response-api-auth.md)
- **A67.** Xác minh HSTS thực tế qua Cloudflare Tunnel — đo, không sửa code (audit network, TODO.md #67) — [chi tiết](docs/instruction/A67-xac-minh-hsts-header-thuc-te-qua-cloudflare-tunnel.md)
- **B68.** Cân nhắc JWT → HttpOnly cookie — cần `features/` thảo luận trước, không code trực tiếp (audit network, TODO.md #68) — [chi tiết](docs/instruction/B68-can-nhac-chuyen-jwt-tu-localstorage-sang-httponly-cookie.md)
- **B69.** Tự host Google Fonts + audio — theo khuôn mẫu B65, kiểm license Freesound trước khi vendor (audit network, TODO.md #69) — [chi tiết](docs/instruction/B69-tu-host-google-fonts-va-audio-de-giam-ro-ri-ip-nguoi-dung.md)
- **B70.** Style nút bấm không nhất quán toàn `client/` — xử lý theo thứ tự ưu tiên, CSS-only không đổi HTML/JS structure (yêu cầu người dùng, TODO.md #70) — [chi tiết](docs/instruction/B70-button-style-khong-nhat-quan-toan-client.md)
- **B71.** Ô chat focus-mode không hiện do tổ tiên `display:none` — cần đổi HTML/JS (dời DOM hoặc re-parent), không phải CSS-only (phát hiện lúc verify #70, TODO.md #71) — [chi tiết](docs/instruction/B71-chat-input-focus-mode-khong-hien-do-display-none-to-tien.md)
- **B73.** `.btn`/`.btn-confirm` thiếu base rule ngoài modal — thêm rule mới, không di chuyển `.modal__actions .btn-confirm` hiện có; kiểm tra `<link>` từng trang trước khi chọn file CSS để đặt rule (báo cáo người dùng kèm ảnh, TODO.md #73) — [chi tiết](docs/instruction/B73-nut-btn-btn-confirm-khong-co-base-style-ngoai-modal.md)
- **B74.** Tournament match thiếu âm thanh (bug thật, làm thẳng được) + thiếu UI đổi Display mode (quyết định cố ý từ B50, phải hỏi lại hướng (a)/(b) trước khi code) (báo cáo người dùng, TODO.md #74) — [chi tiết](docs/instruction/B74-tournament-match-thieu-am-thanh-va-doi-display-mode.md)
- **B75.** Cross Table sắp theo hạng + highlight Vô địch/Á quân khi giải kết thúc — không đổi `computeStandings()`, hỏi lại nếu gặp đồng hạng 1 (báo cáo người dùng kèm ảnh, TODO.md #75) — [chi tiết](docs/instruction/B75-cross-table-sap-xep-theo-hang-va-highlight-champion.md)
- **B76.** Sẵn sàng → tự động vào trận thay vì đợi bấm nút "Vào trận" — sửa client-side (`tournament-detail.js`), chỉ auto-navigate cho người chơi thật (`isMine`), không đụng khán giả, không đổi mốc server start timer (báo cáo người dùng, TODO.md #76) — [chi tiết](docs/instruction/B76-ready-auto-vao-tran-thay-vi-doi-bam-nut-enter.md)
- **B77.** Tournament reload từ SQLite khi server khởi động — dựng lại 3 Map trong bộ nhớ từ dữ liệu đã ghi sẵn (không chạy lại game logic), 2 fixup bắt buộc (Reported→Negotiating, InProgress→Ready qua startNextGame), guest mất userId là giới hạn đã biết không sửa (người dùng hỏi có lưu DB không, TODO.md #77) — [chi tiết](docs/instruction/B77-tournament-du-lieu-song-sot-qua-restart-server.md)
- **B78.** Tournament Games History — bảng `tournament_games` mới (1 hàng/ván, tách khỏi `games`), điểm lưu duy nhất trong `_endMatch` (không điều kiện, không qua `forceCancelMatch`), tái dùng replay viewer có sẵn qua tham số `source`, `winner_name` phải tính ở server (yêu cầu người dùng trực tiếp, TODO.md #78) — [chi tiết](docs/instruction/B78-tournament-games-history-luu-tung-van-dau-rieng.md)
- **B79.** Đồng hồ trận đấu giải đấu hiện sai bên — sửa `renderHeader()` tra tên panel theo `gameState.players[].color` thay vì theo vị trí mảng cố định; KHÔNG đổi `TimerManager`/`PairingLifecycle.js` (slot cố định theo entryId là cố ý) hay thứ tự xoay seat của `startMatch()` (báo cáo người dùng, TODO.md #79) — [chi tiết](docs/instruction/B79-tournament-match-timer-hien-sai-ben.md)
- **B81.** `goToMatch()` full page reload trả giá session-lookup đồng bộ mỗi lần — ĐO trước bằng `bench-session-lookup.js` ở quy mô thực tế, chỉ cân nhắc in-memory session cache nếu số đo xác nhận đáng kể; đổi sang SPA-navigation là quyết định kiến trúc riêng, cần `features/` thảo luận trước, không tự làm (điều tra latency, TODO.md #81) — [chi tiết](docs/instruction/B81-tournament-navigate-full-page-reload-session-lookup-blocking.md)
- **B82.** Bỏ round-trip `tournament:get` thừa sau register/unregister ở `tournament-detail.js:163-164` — server đã tự broadcast `tournament:updated` đầy đủ; chỉ xoá 2 dòng listener thừa, không đụng `tournament:get` dùng cho load ban đầu (điều tra latency, TODO.md #82) — [chi tiết](docs/instruction/B82-tournament-register-thua-round-trip-tournament-get.md)
- **B83.** Debounce broadcast register/unregister theo khuôn mẫu `_queuePairingChanged` (setImmediate-batch theo tournamentId); giữ nguyên broadcast trực tiếp không-debounce cho tournament_started/completed/cancelled (điều tra latency, TODO.md #83) — [chi tiết](docs/instruction/B83-tournament-register-broadcast-khong-debounce.md)
- **B84.** Phân trang `getTournamentGames()`/`GET /api/tournaments/:id/games` theo khuôn mẫu `routes/games.js` (page/limit/pagination); không đổi `ORDER BY started_at ASC` hay endpoint lấy 1 ván (điều tra latency, TODO.md #84) — [chi tiết](docs/instruction/B84-tournament-games-history-khong-phan-trang.md)
- **B85.** `savePairing()` ghi đồng bộ + blob JSON tăng dần — ĐO trước (log tạm quanh `.run()`, đo kích thước blob + thời gian ghi qua 1 series dài) rồi mới quyết định sửa hay đóng lại "không phải bottleneck"; không tự đổi schema/threading khi chưa có số liệu (điều tra latency, TODO.md #85) — [chi tiết](docs/instruction/B85-save-pairing-ghi-dong-bo-json-blob-tang-dan.md)
- **B86.** Click bàn cờ trận đấu giải đấu thỉnh thoảng trễ ~1s, refresh thì hết — đã loại trừ canvas listener/DB đồng bộ qua code; bước tiếp theo CHỈ là thêm instrumentation tạm thời (delta click→ack, transport type, tab visibility) và tái hiện thật, KHÔNG sửa code production trước khi có số đo (báo cáo người dùng, TODO.md #86) — [chi tiết](docs/instruction/B86-tournament-match-board-click-doi-khi-tre-1s-refresh-het.md)
- **B87.** Coalesce `broadcastLiveMatchesUpdate` theo khuôn mẫu `setImmediate`-batch của `_queuePairingChanged` (#83) + thêm diff kiểu `_diffTournamentList`; trọng tâm verify là vòng lặp huỷ giải đấu (N ván live → phải còn 1 broadcast, không phải N); không tối ưu độ phức tạp O(tổng ván live) của `listLiveMatches()` trong cùng fix trừ khi đo được là bottleneck thật (yêu cầu người dùng audit broadcast/throttle, TODO.md #87) — [chi tiết](docs/instruction/B87-live-matches-broadcast-khong-throttle-diff.md)
- **B88.** Gate cả 3 lời gọi `setLeaveLocked(true)` (`tournament-match.js` dòng 71/134/779) theo `myPlayer()` — chỉ khoá khi user hiện tại là 1 trong 2 người chơi thật; dòng 71 (page load) phải BỎ hẳn (không gate) vì `gameState` chưa có lúc đó nên `myPlayer()` luôn `null` bất kể vai trò, để `tmatch:init` (dòng 134) là nơi đầu tiên quyết định khoá; không đổi cơ chế khoá cho người chơi thật hay đụng server (báo cáo người dùng, TODO.md #88) — [chi tiết](docs/instruction/B88-khan-gia-bi-khoa-nut-quay-lai.md)
- **B89.** Ưu tiên `socket.io-parser` (production, DoS) trước `js-yaml`/`nanoid` (devDependency, rủi ro thấp); `npm audit fix` trơn trước, không `--force` ngay; nếu cần bump major `socket.io`/`socket.io-client` phải test thủ công qua app thật (Playwright, không chỉ `npm test`), không tự bump major rồi coi là xong chỉ vì `npm audit` sạch (phát hiện phụ khi cài jsdom cho #88, TODO.md #89) — [chi tiết](docs/instruction/B89-npm-audit-3-high-severity-transitive.md)
- **B90.** Bỏ `requestAnimationFrame(() => boardRenderer.resize())` khỏi `updateBoardState()` trong `tournament-match.js` (khớp hành vi `game-ui.js`); verify bằng tay trong trình duyệt thật (scroll anchoring không test được qua Jest); chỉ thêm `overflow-anchor: none` có mục tiêu nếu tái hiện xác nhận bug vẫn còn sau bước 1, không patch mù; không port focus mode / đổi layout scale-to-fit như cách "sửa" bug này (báo cáo người dùng, TODO.md #90) — [chi tiết](docs/instruction/B90-tournament-match-tu-dong-scroll-khi-click-ban-co.md)
- **B91.** Đăng nhập Google — tái dùng session cookie/`SessionManager` sẵn có, KHÔNG dựng cơ chế xác thực song song; không dùng `passport` (thừa cho 1 provider); `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL` phải optional (503 nếu thiếu, không throw lúc boot); giữ `password_hash NOT NULL` (sinh hash ngẫu nhiên thay vì nới constraint); state cookie chống CSRF bắt buộc; payload callback → `oauth-complete.html` phải qua URL fragment (CSP không cho inline script); KHÔNG tự động liên kết tài khoản Google với tài khoản username/password cùng email (yêu cầu người dùng, TODO.md #91) — [chi tiết](docs/instruction/B91-google-oauth-login.md)
- **B92.** Tái dùng logic CF-Connecting-IP đã có ở `getClientIp(socket)` (§44), trích lõi ra `server/utils/get-client-ip.js` dùng chung; dùng `req.socket.remoteAddress` KHÔNG dùng `req.ip` khi viết cho Express (khác nhau về thời điểm X-Forwarded-For được trộn vào); bắt buộc bọc qua `ipKeyGenerator()` chính chủ của `express-rate-limit` v8 khi viết `keyGenerator` tùy chỉnh; chỉ sửa `authLimiter`, KHÔNG tự mở rộng sang `gamesLimiter`/`tournamentGamesLimiter` dù cùng lỗi (xem B93); đánh số TODO tiếp theo phải tính cả số đã dùng trên `dev` (không chỉ số lớn nhất trong `TODO.md` của `main`) — bug này có trên cả `main` nên branch off `main`, không off `dev` (báo cáo người dùng lúc test #91, TODO.md #92) — [chi tiết](docs/instruction/B92-auth-rate-limit-shared-ip-behind-tunnel.md)
- **B93.** (Chưa làm) `gamesLimiter`/`tournamentGamesLimiter` — khi làm, tái dùng nguyên `getClientIpFromReq()`/`ipKeyGenerator()` từ B92, không viết logic mới; cân nhắc hỏi lại mức ưu tiên trước vì ngưỡng 300 req/15 phút khó chạm tới hơn nhiều so với 20 của auth, chưa có báo cáo người dùng cụ thể (phát hiện phụ khi làm #92, TODO.md #93) — [chi tiết](docs/instruction/B93-games-tournamentgames-rate-limit-same-ip-bug.md)
- **B94.** Đổi `idx_users_oauth` sang `UNIQUE INDEX(oauth_provider, oauth_id)`; migration cho DB đã tồn tại phải dọn dữ liệu trùng (nếu có) TRƯỚC khi tạo unique index, và phải hỏi người dùng trước khi xoá dữ liệu tài khoản thật; bắt riêng lỗi constraint ở `GET /google/callback` (`db.createUser()`) rồi gọi lại `getUserByOAuthId()` thay vì rơi xuống `error=oauth_failed` — đây mới là phần sửa race thật, chặn ở DB không thôi vẫn làm request thua cuộc bị lỗi; viết test bằng SQLite thật, không mock `../db/database` như `auth-google-oauth.test.js` hiện tại (không phát hiện được lỗi tầng DB); Host-header→`redirect_uri` KHÔNG phải finding mới, đã cân nhắc và chấp nhận từ B91 — không điều tra lại (phát hiện qua yêu cầu review database design + security cho OAuth, TODO.md #94) — [chi tiết](docs/instruction/B94-oauth-duplicate-account-race-missing-unique-constraint.md)
- **B95.** (Chưa làm) Cookie state OAuth bị đè khi 2 lần thử song song — đổi hướng xác thực state hoặc điểm so sánh, KHÔNG đụng cơ chế session cookie chính; viết test mô phỏng 2 `GET /google` liên tiếp trước khi coi là xong, cân nhắc kỹ vì đây là cookie chống CSRF (TODO.md #95) — [chi tiết](docs/instruction/B95-oauth-state-cookie-collision-concurrent-attempts.md)
- **B96.** (Chưa làm) `GET /google/callback` không idempotent khi lặp request — phân biệt "state cookie mất vì đã xử lý xong" với "state cookie mất vì giả mạo thật", không cố loại bỏ hoàn toàn race (không thực tế với HTTP), chỉ xử lý đúng khi xảy ra (TODO.md #96) — [chi tiết](docs/instruction/B96-oauth-callback-not-idempotent-duplicate-request.md)
- **B97.** (Chưa làm) Tên hiển thị Google có dấu câu bị thay bằng tên ngẫu nhiên — đọc kỹ mọi nơi gọi `isValidDisplayName()` trước khi đổi, viết `sanitizeDisplayName()` riêng cho nhánh OAuth (strip ký tự thay vì từ chối toàn bộ) thay vì nới lỏng hàm gốc (TODO.md #97) — [chi tiết](docs/instruction/B97-oauth-display-name-punctuation-silently-discarded.md)
- **B98.** (Chưa làm) Lỗi "OAuth chưa cấu hình" không nhất quán giữa 2 route — đưa cả 2 về cùng kiểu redirect `error=oauth_not_configured` kèm i18n riêng (khác `oauth_failed`/`oauth_state`), giữ nguyên lý do dùng redirect thay vì JSON đã ghi trong comment file (TODO.md #98) — [chi tiết](docs/instruction/B98-oauth-not-configured-error-inconsistent-ui.md)
- **B99.** (Chưa làm) `login.js` bounce về `index.html` trước khi kịp hiện banner lỗi OAuth cho người dùng đã đăng nhập — đọc `error=` trong `location.search` TRƯỚC khi gọi `checkExistingSession()`'s redirect, không đổi hành vi cho người dùng chưa đăng nhập (TODO.md #99) — [chi tiết](docs/instruction/B99-login-js-existing-session-hides-oauth-error-banner.md)
- **B100.** (Chưa làm) Migration `idx_users_oauth` (B94) chạy lại mỗi lần boot — thêm guard `PRAGMA index_list('users')` kiểm tra đã `unique=1` chưa trước khi dò-trùng, giữ nguyên hành vi self-healing đã quyết định ở B94 (TODO.md #100) — [chi tiết](docs/instruction/B100-oauth-index-migration-reruns-every-boot.md)
- **B101.** (Chưa làm) Cookie state OAuth tự viết tay flags thay vì tái dùng `baseCookieOptions()` — cho hàm đó nhận thêm tham số `path` tuỳ chọn (mặc định `'/'`, không phá call site cũ), dùng chung cho cả set/clear của `gvn_oauth_state`; giữ `maxAge` riêng, không gộp 2 loại cookie làm một (TODO.md #101) — [chi tiết](docs/instruction/B101-oauth-state-cookie-duplicates-session-cookie-helper.md)
- **B102.** (Chưa làm) Trùng logic "lưu user + chuyển hướng lobby" giữa `login.js`/`oauth-complete.js`, cộng 2 điểm kém hiệu quả nhỏ — gộp thành `GvnSession.completeLogin()`, bỏ SELECT thừa sau INSERT; phần bỏ `oauth-complete.html` (round-trip thừa) cân nhắc kỹ hơn, có thể tách làm riêng (TODO.md #102) — [chi tiết](docs/instruction/B102-oauth-client-duplication-and-minor-inefficiency.md)
- **B103.** (Đã làm) Luật WALL nước thứ 2 của P1 cách nước 1 khoảng cách **Chebyshev ≥ 4** (đã hỏi lại và chốt: Chebyshev không phải Manhattan, ≥4 không phải =4; áp dụng bất cứ khi nào WALL bật kể cả biến thể Hole; không áp dụng khi Swap2 bật vì Swap2 tự tắt WALL); theo dõi nước đi riêng qua `moveHistory` lọc theo `color`, không dùng `moveCount` toàn cục (yêu cầu người dùng, TODO.md #103) — [chi tiết](docs/instruction/B103-wall-rule-nuoc-thu-2-manhattan-khoang-cach-4.md)

## "Đừng làm" — reviewer chỉ rõ ranh giới không nên đụng

- **Đừng chuyển `game:moved` sang delta** — đã là delta tối ưu (121 B/nước,
  ngang mức tối ưu của dự án cùng bài toán). Không có việc gì để làm ở đây.
- **Đừng đụng `client/js/socket-client.js:40`** — cách chọn `ws://`/`wss://`
  theo origin đã đúng, sửa vào đây có thể tạo lại đúng lỗi TLS đang tránh.
- **Đừng nới rate limiter trong code production chỉ để tự test được** (xem quy
  tắc chung #0) — nếu cần test hơn 20 "người dùng", restart server giữa các đợt
  thay vì đổi ngưỡng.
- **Đừng sửa file gốc để chạy mutation test** — luôn copy sang thư mục tạm.
