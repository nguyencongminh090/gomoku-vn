# Instruction — FROZEN legacy index (no new entries since 2026-10-09)

New guidance (approach, traps, don't-touch) goes in the todo file's `Scope`/`Don't`/`Traps`. Read-only history below.

Entry per legacy TODO item → `docs/instruction/<CODE>-<slug>.md`. Pre-2026-10-08 long text: `docs/archive/instruction-full-2026-10-08.md` (grep only).

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
- **A130.** Tunnel `cloudflared` — **đã điều tra xong, không phải lỗi**; giữ file làm bản ghi âm tính để chặn điều tra lặp. Bài học phương pháp:… — [chi tiết](docs/instruction/A130-cloudflared-quic-flap-chuyen-sang-protocol-http2.md)
- **A171.** **ĐÃ ĐÓNG 2026-08-29 — đã đo, hoãn theo quyết định người dùng (đánh đổi có chủ đích, không ngân sách / không thẻ tín dụng).** Nguyên… — [chi tiết](docs/instruction/A171-tunnel-cf-free-tier-phat-nguoi-choi-cn-us.md)

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
- **B62.** Check-in Sẵn sàng giữa các ván trong series nên tái dùng Start Modal ngay trong `tournament-match.html` — từ yêu cầu người dùng… — [chi tiết](docs/instruction/B62-series-ready-checkin-tai-cho-trong-tournament-match-thay-vi-quay-lai-trang.md)
- **B63.** Standings nên cộng dồn điểm thật (`seriesScore`) thay vì 1 điểm/pairing thắng — từ báo cáo người dùng (TODO.md #63) — [chi tiết](docs/instruction/B63-standings-score-nen-cong-don-tung-van-thay-vi-1-diem-moi-pairing.md)
- **B64.** Round Robin: Cross Table thay bảng Standings dạng danh sách — tiếp nối #63 (TODO.md #64) — [chi tiết](docs/instruction/B64-round-robin-cross-table-thay-danh-sach-standings.md)
- **B65.** CSP + third-party script — bảo vệ JWT bearer trong `localStorage` (security review Network, TODO.md #65) — [chi tiết](docs/instruction/B65-csp-va-third-party-script-bao-ve-jwt-localstorage.md)
- **B66.** `Cache-Control: no-store` trên response `/api/auth/*` — chỉ sửa `auth.js`, không áp toàn cục (audit network, TODO.md #66) — [chi tiết](docs/instruction/B66-cache-control-no-store-tren-response-api-auth.md)
- **A67.** Xác minh HSTS thực tế qua Cloudflare Tunnel — đo, không sửa code (audit network, TODO.md #67) — [chi tiết](docs/instruction/A67-xac-minh-hsts-header-thuc-te-qua-cloudflare-tunnel.md)
- **B68.** Cân nhắc JWT → HttpOnly cookie — cần `features/` thảo luận trước, không code trực tiếp (audit network, TODO.md #68) — [chi tiết](docs/instruction/B68-can-nhac-chuyen-jwt-tu-localstorage-sang-httponly-cookie.md)
- **B69.** Tự host Google Fonts + audio — theo khuôn mẫu B65, kiểm license Freesound trước khi vendor (audit network, TODO.md #69) — [chi tiết](docs/instruction/B69-tu-host-google-fonts-va-audio-de-giam-ro-ri-ip-nguoi-dung.md)
- **B70.** Style nút bấm không nhất quán toàn `client/` — xử lý theo thứ tự ưu tiên, CSS-only không đổi HTML/JS structure (yêu cầu người dùng, TODO.md #70) — [chi tiết](docs/instruction/B70-button-style-khong-nhat-quan-toan-client.md)
- **B71.** Ô chat focus-mode không hiện do tổ tiên `display:none` — cần đổi HTML/JS (dời DOM hoặc re-parent), không phải CSS-only (phát hiện lúc… — [chi tiết](docs/instruction/B71-chat-input-focus-mode-khong-hien-do-display-none-to-tien.md)
- **B73.** `.btn`/`.btn-confirm` thiếu base rule ngoài modal — thêm rule mới, không di chuyển `.modal__actions .btn-confirm` hiện có; kiểm tra… — [chi tiết](docs/instruction/B73-nut-btn-btn-confirm-khong-co-base-style-ngoai-modal.md)
- **B74.** Tournament match thiếu âm thanh (bug thật, làm thẳng được) + thiếu UI đổi Display mode (quyết định cố ý từ B50, phải hỏi lại hướng… — [chi tiết](docs/instruction/B74-tournament-match-thieu-am-thanh-va-doi-display-mode.md)
- **B75.** Cross Table sắp theo hạng + highlight Vô địch/Á quân khi giải kết thúc — không đổi `computeStandings()`, hỏi lại nếu gặp đồng hạng 1… — [chi tiết](docs/instruction/B75-cross-table-sap-xep-theo-hang-va-highlight-champion.md)
- **B76.** Sẵn sàng → tự động vào trận thay vì đợi bấm nút "Vào trận" — sửa client-side (`tournament-detail.js`), chỉ auto-navigate cho người chơi… — [chi tiết](docs/instruction/B76-ready-auto-vao-tran-thay-vi-doi-bam-nut-enter.md)
- **B77.** Tournament reload từ SQLite khi server khởi động — dựng lại 3 Map trong bộ nhớ từ dữ liệu đã ghi sẵn (không chạy lại game logic), 2… — [chi tiết](docs/instruction/B77-tournament-du-lieu-song-sot-qua-restart-server.md)
- **B78.** Tournament Games History — bảng `tournament_games` mới (1 hàng/ván, tách khỏi `games`), điểm lưu duy nhất trong `_endMatch` (không điều… — [chi tiết](docs/instruction/B78-tournament-games-history-luu-tung-van-dau-rieng.md)
- **B79.** Đồng hồ trận đấu giải đấu hiện sai bên — sửa `renderHeader()` tra tên panel theo `gameState.players[].color` thay vì theo vị trí mảng… — [chi tiết](docs/instruction/B79-tournament-match-timer-hien-sai-ben.md)
- **B81.** `goToMatch()` full page reload trả giá session-lookup đồng bộ mỗi lần — ĐO trước bằng `bench-session-lookup.js` ở quy mô thực tế, chỉ… — [chi tiết](docs/instruction/B81-tournament-navigate-full-page-reload-session-lookup-blocking.md)
- **B82.** Bỏ round-trip `tournament:get` thừa sau register/unregister ở `tournament-detail.js:163-164` — server đã tự broadcast… — [chi tiết](docs/instruction/B82-tournament-register-thua-round-trip-tournament-get.md)
- **B83.** Debounce broadcast register/unregister theo khuôn mẫu `_queuePairingChanged` (setImmediate-batch theo tournamentId); giữ nguyên… — [chi tiết](docs/instruction/B83-tournament-register-broadcast-khong-debounce.md)
- **B84.** Phân trang `getTournamentGames()`/`GET /api/tournaments/:id/games` theo khuôn mẫu `routes/games.js` (page/limit/pagination); không đổi… — [chi tiết](docs/instruction/B84-tournament-games-history-khong-phan-trang.md)
- **B85.** `savePairing()` ghi đồng bộ + blob JSON tăng dần — ĐO trước (log tạm quanh `.run()`, đo kích thước blob + thời gian ghi qua 1 series… — [chi tiết](docs/instruction/B85-save-pairing-ghi-dong-bo-json-blob-tang-dan.md)
- **B86.** Click bàn cờ trận đấu giải đấu thỉnh thoảng trễ ~1s, refresh thì hết — đã loại trừ canvas listener/DB đồng bộ qua code; bước tiếp theo… — [chi tiết](docs/instruction/B86-tournament-match-board-click-doi-khi-tre-1s-refresh-het.md)
- **B87.** Coalesce `broadcastLiveMatchesUpdate` theo khuôn mẫu `setImmediate`-batch của `_queuePairingChanged` (#83) + thêm diff kiểu… — [chi tiết](docs/instruction/B87-live-matches-broadcast-khong-throttle-diff.md)
- **B88.** Gate cả 3 lời gọi `setLeaveLocked(true)` (`tournament-match.js` dòng 71/134/779) theo `myPlayer()` — chỉ khoá khi user hiện tại là 1… — [chi tiết](docs/instruction/B88-khan-gia-bi-khoa-nut-quay-lai.md)
- **B89.** Ưu tiên `socket.io-parser` (production, DoS) trước `js-yaml`/`nanoid` (devDependency, rủi ro thấp); `npm audit fix` trơn trước, không… — [chi tiết](docs/instruction/B89-npm-audit-3-high-severity-transitive.md)
- **B90.** Bỏ `requestAnimationFrame(() => boardRenderer.resize())` khỏi `updateBoardState()` trong `tournament-match.js` (khớp hành vi… — [chi tiết](docs/instruction/B90-tournament-match-tu-dong-scroll-khi-click-ban-co.md)
- **B91.** Đăng nhập Google — tái dùng session cookie/`SessionManager` sẵn có, KHÔNG dựng cơ chế xác thực song song; không dùng `passport` (thừa… — [chi tiết](docs/instruction/B91-google-oauth-login.md)
- **B92.** Tái dùng logic CF-Connecting-IP đã có ở `getClientIp(socket)` (§44), trích lõi ra `server/utils/get-client-ip.js` dùng chung; dùng… — [chi tiết](docs/instruction/B92-auth-rate-limit-shared-ip-behind-tunnel.md)
- **B93.** (Chưa làm) `gamesLimiter`/`tournamentGamesLimiter` — khi làm, tái dùng nguyên `getClientIpFromReq()`/`ipKeyGenerator()` từ B92, không viết logic mới; cân nhắc hỏi lại mức ưu tiên trước vì ngưỡng 300 req/15 phút khó chạm tới hơn nhiều so với 20 của auth, chưa có báo cáo người dùng cụ thể (phát hiện phụ khi làm #92, TODO.md #93) — [chi tiết](docs/instruction/B93-games-tournamentgames-rate-limit-same-ip-bug.md)
- **B94.** Đổi `idx_users_oauth` sang `UNIQUE INDEX(oauth_provider, oauth_id)`; migration cho DB đã tồn tại phải dọn dữ liệu trùng (nếu có) TRƯỚC… — [chi tiết](docs/instruction/B94-oauth-duplicate-account-race-missing-unique-constraint.md)
- **B95.** (Chưa làm) Cookie state OAuth bị đè khi 2 lần thử song song — đổi hướng xác thực state hoặc điểm so sánh, KHÔNG đụng cơ chế session… — [chi tiết](docs/instruction/B95-oauth-state-cookie-collision-concurrent-attempts.md)
- **B96.** (Chưa làm) `GET /google/callback` không idempotent khi lặp request — phân biệt "state cookie mất vì đã xử lý xong" với "state cookie… — [chi tiết](docs/instruction/B96-oauth-callback-not-idempotent-duplicate-request.md)
- **B97.** (Chưa làm) Tên hiển thị Google có dấu câu bị thay bằng tên ngẫu nhiên — đọc kỹ mọi nơi gọi `isValidDisplayName()` trước khi đổi, viết… — [chi tiết](docs/instruction/B97-oauth-display-name-punctuation-silently-discarded.md)
- **B98.** (Chưa làm) Lỗi "OAuth chưa cấu hình" không nhất quán giữa 2 route — đưa cả 2 về cùng kiểu redirect `error=oauth_not_configured` kèm… — [chi tiết](docs/instruction/B98-oauth-not-configured-error-inconsistent-ui.md)
- **B99.** (Chưa làm) `login.js` bounce về `index.html` trước khi kịp hiện banner lỗi OAuth cho người dùng đã đăng nhập — đọc `error=` trong… — [chi tiết](docs/instruction/B99-login-js-existing-session-hides-oauth-error-banner.md)
- **B100.** (Chưa làm) Migration `idx_users_oauth` (B94) chạy lại mỗi lần boot — thêm guard `PRAGMA index_list('users')` kiểm tra đã `unique=1`… — [chi tiết](docs/instruction/B100-oauth-index-migration-reruns-every-boot.md)
- **B101.** (Chưa làm) Cookie state OAuth tự viết tay flags thay vì tái dùng `baseCookieOptions()` — cho hàm đó nhận thêm tham số `path` tuỳ chọn… — [chi tiết](docs/instruction/B101-oauth-state-cookie-duplicates-session-cookie-helper.md)
- **B102.** (Chưa làm) Trùng logic "lưu user + chuyển hướng lobby" giữa `login.js`/`oauth-complete.js`, cộng 2 điểm kém hiệu quả nhỏ — gộp thành… — [chi tiết](docs/instruction/B102-oauth-client-duplication-and-minor-inefficiency.md)
- **B103.** (Đã làm) Luật WALL nước thứ 2 của P1 cách nước 1 khoảng cách **Chebyshev ≥ 4** (đã hỏi lại và chốt: Chebyshev không phải Manhattan, ≥4… — [chi tiết](docs/instruction/B103-wall-rule-nuoc-thu-2-manhattan-khoang-cach-4.md)
- **B104.** (Đã làm) Mobile: chạm bảng cờ làm chatbox active & trang tự cuộn — dời `e.preventDefault()` lên trước guard sớm-thoát trong… — [chi tiết](docs/instruction/B104-mobile-chatbox-active-va-scroll-khi-tap-board.md)
- **B105.** (Chưa làm) Thêm `compression` middleware trước `express.static`; đặt kỳ vọng cho đúng — CF đã nén Brotli cho người dùng cuối rồi, mục… — [chi tiết](docs/instruction/B105-khong-co-compression-middleware.md)
- **B106.** (Chưa làm) **Ưu tiên cao nhất nhóm #105-#110.** Truyền `setHeaders` cho `express.static`: `*.html` → `no-cache` (KHÔNG cache dài —… — [chi tiết](docs/instruction/B106-cache-control-max-age-0-ep-revalidate-moi-request.md)
- **B107.** (Chưa làm) Đổi `socket.io.js` → `socket.io.min.js` ở đúng 4 file HTML, sửa cả 4 không sửa lẻ (kiểm bằng `grep -rn… — [chi tiết](docs/instruction/B107-socket-io-ban-debug-khong-minify.md)
- **B108.** (GĐ1 đã làm 2026-08-12; GĐ2 đóng, không làm) Chia 2 giai đoạn theo rủi ro: GĐ1 (thấp) bỏ `<link>` bold ở 3 trang không dùng + đổi… — [chi tiết](docs/instruction/B108-phosphor-icon-font-qua-nang.md)
- **B109.** (Chưa làm) **Rủi ro cao nhất nhóm, làm SAU CÙNG và phải hỏi người dùng trước** (họ vận hành server thật). Tuyệt đối không chỉ đặt… — [chi tiết](docs/instruction/B109-production-chay-che-do-dev-dist-cu.md)
- **B110.** (Chưa làm) Ưu tiên thấp nhất — cân nhắc ĐÓNG thay vì làm nếu #105-#108 đã đủ nhanh (lợi thật chỉ ~8-9 KB sau nén); nếu làm thì giữ… — [chi tiết](docs/instruction/B110-i18n-ship-ca-2-ngon-ngu.md)
- **B111.** (Chưa làm) Lỗ hổng còn lại của B106, phát hiện khi đo lại: file client socket.io do `serveClient` của socket.io phục vụ, ngoài tầm… — [chi tiết](docs/instruction/B111-socket-io-client-bo-qua-static-cache-control.md)

## "Đừng làm" — reviewer chỉ rõ ranh giới không nên đụng

- **Đừng chuyển `game:moved` sang delta** — đã là delta tối ưu (121 B/nước,
  ngang mức tối ưu của dự án cùng bài toán). Không có việc gì để làm ở đây.
- **Đừng đụng `client/js/socket-client.js:40`** — cách chọn `ws://`/`wss://`
  theo origin đã đúng, sửa vào đây có thể tạo lại đúng lỗi TLS đang tránh.
- **Đừng nới rate limiter trong code production chỉ để tự test được** (xem quy
  tắc chung #0) — nếu cần test hơn 20 "người dùng", restart server giữa các đợt
  thay vì đổi ngưỡng.
- **Đừng sửa file gốc để chạy mutation test** — luôn copy sang thư mục tạm.
- **B112.** (Chưa làm) **Hỏi người dùng chọn (A) tắt Web Analytics trên dashboard hay (B) nới CSP trước khi viết code** — câu hỏi thật là "có dùng… — [chi tiết](docs/instruction/B112-cloudflare-insights-beacon-bi-csp-chan.md)
- **B113.** (Đã làm) Branch off `dev`, không phải `ui/*` đang mở, vì đụng `server/` (backend-locked trên `ui/*`); `disconnected` phải… — [chi tiết](docs/instruction/B113-slot-status-presence.md)
- **B114.** (Chưa làm) Đổi nguồn Active/Inactive của slot dot từ `player.ready` sang `room.state === 'playing'` — **KHÔNG phải… — [chi tiết](docs/instruction/B114-slot-status-active-inactive-thay-ready.md)
- **B115.** (Đã làm) Tách nhánh cuối của `handleDisconnect()` (`DisconnectHandler.js:37-79`) theo `slot`: `slot === null` (Viewer thật) → bỏ hẳn… — [chi tiết](docs/instruction/B115-viewer-reconnect-khong-gioi-han-thoi-gian.md)
- **B116.** (Đã làm) **Phạm vi là `client/room.html`/`client/js/room-ui.js` (phòng chơi thường), — [chi tiết](docs/instruction/B116-tournament-match-scoreboard-lan-chiem-mobile-chat.md)
- **B117.** (Đã làm) Bug hiệu năng thuần client, không đụng server — `_diffLobbyRooms`/ — [chi tiết](docs/instruction/B117-lobby-render-lai-toan-bo-khi-patch.md)
- **B118.** (Đã làm, sửa phòng ngừa) Bàn cờ mobile méo/lệch — nghi vấn `100vh` (không `dvh`) ở
  `.board-area-shell` + `window resize` listener không throttle ở `game-ui.js:113-114`; **không có
  thiết bị Safari iOS để tái hiện**, người dùng chốt sửa phòng ngừa ngay thay vì chờ; đọc tiền lệ
  `docs/fix-log/2026-08-13-zen-room-board-sizing-and-chat-input.md` (bug canvas không vuông cùng
  cụm code) và B90 (tiền lệ bỏ resize tự động vì gây scroll ngoài ý muốn) trước khi code; liệt kê
  toàn bộ điểm gọi `BoardRenderer.resize()` trước khi thêm debounce; KHÔNG đụng
  `tournament-match.js`/`tournament-match.html` (báo cáo gốc chỉ có ảnh `room.html`); cần người
  dùng gốc xác nhận sau khi deploy — nếu vẫn còn lỗi, quay lại hướng `visualViewport` API (báo cáo
  người dùng kèm ảnh Safari iOS thật, TODO.md #118) — [chi
  tiết](docs/instruction/B118-ban-co-mobile-meo-lech-khong-on-dinh-do-resize-khong-throttle.md)
- **B119.** (Đã làm) Guest bấm "Create account" trong Settings không vào được form đăng ký — sửa — [chi tiết](docs/instruction/B119-guest-khong-tao-duoc-tai-khoan-tu-nut-create-account.md)
- **B120.** (Đã làm) Login page thiếu Language Toggle — KHÔNG viết lại `createLangSwitcher()`/ — [chi tiết](docs/instruction/B120-login-html-thieu-language-toggle-do-selector-cu-hong.md)
- **B121.** (Đã làm) Tên phòng mặc định → `#<roomID>` — sửa `RoomManager.js:130`:
  `` `#${roomId}` `` (tái dùng biến `roomId` đã sinh ở dòng 129, không sinh mã mới); chỉ đổi nhánh
  mặc định, giữ nguyên nhánh người dùng tự đặt tên; đã rà `client/js/lobby.js:260,304` — không cần
  sửa gì thêm phía client; không đụng `_generateRoomId()` hay logic route/join bằng `roomId`; định
  dạng đã chốt trực tiếp với người dùng là `#<roomID>` không chữ "Phòng"; 2 test mới trong
  `RoomManager.test.js` (báo cáo người dùng, TODO.md #121) — [chi
  tiết](docs/instruction/B121-doi-ten-phong-mac-dinh-sang-id-phong.md)
- **A125.** Cấu hình dashboard Cloudflare, không sửa code — không đụng `server/index.js` (ETag
  origin đã đúng). Bật "Respect Strong ETags" nếu người dùng có quyền truy cập, không gấp (review
  vòng 4 mục 13.9b, TODO.md #125) — [chi tiết](docs/instruction/A125-cloudflare-respect-strong-etags-cho-html.md)
- **B122.** (Chưa làm) Chỉ xoá đúng 1 dòng `<script>` `profanity-classifier-model.js` khỏi
  `room.html:202`, không đụng file JS; bump `?v=`; xác minh thủ công bằng DevTools Network + thử
  chat vì không có Jest cho HTML client (review vòng 4 mục 13.5, TODO.md #122) — [chi
  tiết](docs/instruction/B122-bo-profanity-classifier-model-khoi-room-html.md)
- **B123.** (Chưa làm) `<link rel="preload" as="font">` — số lượng phải khớp đúng weight mỗi trang
  đang nạp (`room`/`tournament`/`tournament-match`/`history` cần cả regular+bold, `index`/`login`
  chỉ regular sau B108(a)); không preload thừa; `crossorigin` bắt buộc (yêu cầu người dùng, xác
  nhận trực tiếp icon vào muộn trên mạng chậm, TODO.md #123) — [chi
  tiết](docs/instruction/B123-preload-font-phosphor-woff2-giam-do-tre-hien-thi-icon.md)
- **B124.** (Đã làm) Đổi `forwarded.split(',')[0].trim()` → `.pop().trim()` ở — [chi tiết](docs/instruction/B124-getclientip-xff-lay-phan-tu-cuoi-thay-vi-dau.md)
- **B126.** (Chưa làm, làm SAU CÙNG — STRICT) ⚠️ Người dùng dùng Cloudflare Tunnel forward localhost
  thật ra domain thật, không có staging tách biệt — bắt buộc: branch riêng, không sửa bản đang phục
  vụ tunnel lúc có người chơi thật, đo qua HTTP/2 domain thật ≥7 lần lấy min/median (không
  localhost — bẫy vcaro), viết test canh hint↔import không lệch để tránh tải file 2 lần âm thầm
  (review vòng 4 mục 13.6, TODO.md #126) — [chi
  tiết](docs/instruction/B126-modulepreload-cho-es-module-do-tren-domain-that-qua-tunnel.md)
- **B127.** (Chưa làm, làm SAU CÙNG — STRICT, cùng nhóm với B126) Grep xác nhận class nào của
  `lobby.css` thật sự dùng ở `room.html` trước khi bỏ `<link>`; xác minh bằng trình duyệt thật đủ 4
  tab + 2 viewport theo khuôn mẫu B108/B116/B118, không chỉ đoán; không đổi CSS token đã LOCKED
  (review vòng 4 mục 13.7, TODO.md #127) — [chi
  tiết](docs/instruction/B127-gop-css-theo-trang-bo-lobby-css-thua-o-room.md)
- **B128.** (Chưa làm) Undo trong `room.html`, thảo luận qua `features/undo/`. Thuật toán lõi bắt
  buộc: snapshot `targetIndex` (nước gần nhất của người yêu cầu trong `moveHistory`) **lúc gửi yêu
  cầu**, không tính lại lúc accept; auto-cancel `undoOffer` chỉ khi **chính người yêu cầu** đi thêm
  nước, **không** unconditional như `drawOffer` (`GameEngine.js:216`); phải thêm `undoOffer` vào
  `GameEngine.serialize()` (hiện `drawOffer` không có trong đó — khoảng trống có sẵn, không phải đã
  có sẵn cơ chế để tái dùng) để reconnect thấy lại yêu cầu đang chờ; giai đoạn Swap2
  (`openingPhase !== 'play'`) vẫn phải hỗ trợ nhưng **chưa có thuật toán** — thiết kế riêng lúc
  triển khai, đừng tự suy diễn rồi code luôn; chỉ khôi phục đồng hồ `per_move` (không cần
  `TimerManager` code mới, chỉ gọi `switchTurn`), `blitz`/`per_game` không trả lại thời gian; không
  giới hạn số lần; không áp dụng cho trận đấu giải đấu (yêu cầu người dùng, TODO.md #128) — [chi
  tiết](docs/instruction/B128-them-tinh-nang-undo-hoan-tac-nuoc-di-o-room-html.md)
- **B129.** (Chưa làm) Override quyết định "không làm" của B108 — Giai đoạn 1 (audit runtime đầy
  đủ tập icon, kể cả class ghép động trong `tournament-match.js:721,760`) **bắt buộc xong trước**
  Giai đoạn 2 (build SVG sprite + thay markup); không xoá file font Phosphor gốc; gate hoàn thành
  bằng kiểm tra khách quan "0 phần tử `.ph-*` còn sót" sau migrate, không phải "nhìn qua thấy ổn"
  (yêu cầu người dùng sau phân tích HAR, TODO.md #129) — [chi
  tiết](docs/instruction/B129-svg-icon-thay-phosphor-audit-truoc-khi-lam.md)
- **B131.** (Chưa làm) `timeout: 8000` cho `io({...})` trong `client/js/socket-client.js` — đúng 1 dòng; **giữ nguyên** `transports:… — [chi tiết](docs/instruction/B131-socket-io-client-timeout-20s-qua-lau.md)
- **B132.** (Chưa làm) `.game-controls`/`.btn-game` trong `client/css/game.css`, block `@media
  (max-width: 768px)` quanh dòng 636-651 — bỏ `flex-wrap: wrap`, chuyển sang `overflow-x: auto` +
  `scroll-snap-type: x proximity` scoped đúng `#game-controls`, không đụng `.room`/ancestor nào khác
  (yêu cầu người dùng: "chỉ cuộn khối chứa button, không cuộn cả trang"); nút không co ép
  (`flex: 0 0 auto; min-width` đủ chứa text ngắn nhất), nút cuối cố ý không set width bằng nhau để
  tự cắt hụt làm gợi ý còn nội dung khi tràn — không thêm gradient/overlay riêng; **bẫy đã gặp lúc
  làm thật**: `.game-controls` base rule (desktop, dòng ~181-190) có `justify-content: center` —
  trên container overflow có thể cuộn, `center` làm trình duyệt cắt nội dung **đối xứng cả 2 đầu**
  ngay tại `scrollLeft: 0`, khiến nút đầu tiên bị pre-clip và **không cách nào cuộn tới được**
  (`scrollLeft` không âm được) — phải override `justify-content: flex-start` riêng cho breakpoint
  mobile; không đụng `room-zen.css` (zen skin không set `flex-wrap` riêng nên thừa hưởng rule này,
  không cần sửa thêm chỗ khác) nhưng vẫn phải verify bằng DOM thật với `body.zen-room` vì đó là skin
  mặc định của `room.html`; verify bắt buộc bằng Playwright đo `getBoundingClientRect()` ở cả
  `scrollLeft: 0` và `scrollLeft: max` (không chỉ nhìn ảnh chụp) để xác nhận nút đầu/cuối đều tới
  được trọn vẹn, cộng `window.scrollY` không đổi khi cuộn container; bump `?v=N` toàn bộ và verify
  bằng grep (TODO.md #132) — [chi
  tiết](docs/instruction/B132-game-controls-cuon-ngang-1-hang-thay-vi-wrap-2-hang.md)
- **B133.** (Đã làm, 3 vòng) `client/js/board.js` + `client/css/room-zen.css` mobile. (1) Grid
  alpha 0.22→0.4→**0.55** (vòng 3: người dùng "Line still add more weight, need darker grid" sau khi
  xem 0.4 trên máy thật); border cùng chỗ (0.4, chưa từng đụng) nâng theo 0.65 để giữ đúng thứ bậc
  "border đậm hơn grid". (2) Trục dọc — `viewportBudget` (nhánh `zenRoom && mobileWidth`): thay
  budget non-zen cứng `14+16+12+8=50px` (double-count) bằng overhead zen thật
  (`canvasWrapBorder`+`turnBarMargin`+`controlsMargin`, tính lại inline vì biến gốc scope trong
  nhánh khác); xác nhận qua đo +48px trên viewport height-bound (375×520). (3) Trục ngang (vòng 2,
  người dùng đo trên điện thoại thật: canvas 476 / shell 500) — bỏ side padding 8px/bên trong
  `room-zen.css` mobile (cả rule gốc lẫn override `.zen-drawer-collapsed`) + tách nhánh `maxVw`: zen
  bỏ `- 8` thừa (mẹo full-bleed của `room.css` mà `- 8` chống overshoot không áp dụng cho zen —
  `room-zen.css` mobile đã huỷ mẹo đó), chỉ trừ 2px hairline `.board-canvas-wrap`; non-zen giữ
  nguyên `- 8`. `client/js/` không test tự động — verify bằng Playwright trên instance cô lập (copy
  repo + DB tạm + cổng 3111 + `CORS_ORIGIN` riêng) mỗi vòng, cộng xác nhận trực tiếp của người dùng
  trên máy thật cho cả màu lẫn kích thước; `?v=123→126` trên nhánh fix. **Vòng 4** (sau merge vào
  `dev`): merge giữ nguyên `?v=133` cũ thay vì re-bump — sai theo quy tắc `git-workflow`
  ("max(dev,main)+1" khi nội dung file thật sự đổi lúc merge, không chỉ giữ số hiện có dù đã cao
  hơn nhánh fix); sửa lại `?v=133→134` (báo cáo người dùng qua chụp mobile, TODO.md
  #133) — [chi
  tiết](docs/instruction/B133-mobile-grid-line-nhat-va-ban-co-nho.md)
- **B134.** (Đã làm) Nguyên nhân: `client/js/room-socket.js`'s `game:init` check — [chi tiết](docs/instruction/B134-sidebar-tab-thut-vao-trong-khi-redraw.md)
- **B135.** (Đã làm) `i`→`.icon` thuần selector, **không đổi** giá trị font-size/display nào khác,
  6 vị trí trong `lobby-zen.css`/`room.css`/`room-zen.css`/`history.css` (danh sách đầy đủ trong
  `docs/todo/B135-*.md`). Cố ý **không đụng** `lobby.css`'s `.btn-create i`/`.btn-secondary i` — CSS
  chết từ trước #129, không phần tử thật nào dùng class đó với icon. Bug chỉ tồn tại trên `dev`
  (main chưa merge #129) — nhánh `fix/*` off `dev`, merge lại `dev`, không đụng `main`. Đo Playwright
  xác nhận bug thật (13px→15px) nhưng KHÔNG khớp độ lớn "zoom" trong ảnh chụp gốc của người dùng —
  đo lại trên production thật trước khi deploy cho kết quả đúng 15px sẵn, nghi ngờ report gốc là
  cache trình duyệt/CDN thời điểm đang bump `?v=` liên tục, không phải bug code dài hạn. **Người
  dùng xác nhận sau hard-refresh: hết "zoom"** — giả thuyết cache đúng, 2 việc độc lập, cả hai đều
  đã đóng (TODO.md #135) — [chi
  tiết](docs/instruction/B135-svg-icon-migration-orphaned-css-selectors.md)
- **B136.** (Reopen #134) **Không vá thêm một lớp nữa ở nơi triệu chứng hiện ra** — #134 đã là một
  vòng vá như vậy (`CLAUDE.md` → "Root-cause diagnosis"). Bắt buộc có **stack trace thật** trỏ vào
  nơi thêm `zen-drawer-collapsed` trước khi viết fix: `MutationObserver` trên
  `document.body`/`attributeFilter:['class']` + `console.trace()`, chạy bằng Playwright. Giữ nguyên:
  bản sửa #134 (`room.js:135-140`), breakpoint 768px, cơ chế width/overflow-clip/flex-end của
  `.panel-right-shell`. Nghi phạm số 1 là `chatBtn.click()` tổng hợp (`room-ui.js:488-495` và
  `544-549`) đi vào nhánh `toggle()` của handler tab (`room.js:158`) — nếu xác nhận, hướng sửa đúng
  là **tách ý định khỏi sự kiện DOM** (hàm `activateTab(id)` dùng chung, click tổng hợp gọi hàm đó
  chứ không giả lập click), không phải thêm cờ chống-toggle — [chi
  tiết](docs/instruction/B136-drawer-thut-vao-khi-modal-hien-len.md)
- **B137.** **Không** chuyển `#start-modal` thành con của `#board-area`: `GameUI.initBoard()` ghi đè — [chi tiết](docs/instruction/B137-start-modal-phu-tron-viewport-de-len-drawer.md)
- **B138.** `inert` là **thuộc tính DOM**, không set được bằng CSS ⇒ phải móc vào **cả 3** nơi đổi — [chi tiết](docs/instruction/B138-drawer-dong-chi-la-clip-noi-dung-van-focus-duoc.md)
- **B139.** Giữ `pointer-events: none` trên `.start-modal` (§B36) — sửa **thang z-index**, đừng đổi — [chi tiết](docs/instruction/B139-mobile-nut-bat-dau-bi-bottom-sheet-che.md)
- **B141.** Tách bạch hai phần: đua `?id=` là **bug thật của spec**, sửa một dòng — [chi tiết](docs/instruction/B141-e2e-flaky-room-url-race-va-rate-limit.md)
- **B142.** `1fr` == `minmax(auto, 1fr)`; cái `auto` là **min-content của grid item**, và trong một — [chi tiết](docs/instruction/B142-grid-track-1fr-day-rail-ra-khoi-drawer.md)
- **B143.** `min-width/min-height: 32px` của `.slot-card__stand` là **ngưỡng vùng chạm mobile** — hạ — [chi tiết](docs/instruction/B143-nut-dung-day-bop-ten-nguoi-choi.md)
- **B144.** Chốt phương án tương tác (vuốt / nút `V`) bằng `AskUserQuestion` **trước** khi code — — [chi tiết](docs/instruction/B144-an-topnav-tren-mobile-phong-choi.md)
- **B145.** Rủi ro số một là **hai instance socket** — #51 đã từng gây đúng vậy (`?v=` lệch ⇒ — [chi tiết](docs/instruction/B145-socket-mo-qua-muon-trong-doi-trang.md)
- **B146.** **Đo trước, đừng tin #81**: bench cũ đo đường ĐỌC, mục này là lệnh GHI — mở rộng — [chi tiết](docs/instruction/B146-touchsession-ghi-sqlite-dong-bo-chan-truoc-101.md)
- **B147.** **Dừng và hỏi người dùng trước khi viết code** — không phải "bật một cờ". Ba vùng nguy — [chi tiết](docs/instruction/B147-chua-bat-connectionstaterecovery.md)
- **B148.** Đây là code **chống lạm dụng**, không phải code tiện ích — không giữ được hành vi tương — [chi tiết](docs/instruction/B148-setinterval-moi-socket-trong-flood-middleware.md)
- **B149.** **Không "sửa cho có".** Kịch bản (2 connection tới `gomoku.db`) không reachable trong — [chi tiết](docs/instruction/B149-touchsession-block-5s-neu-co-connection-thu-hai.md)
- **B150.** **Hỏi trước khi làm: cái này có đáng làm không?** Không ai báo cáo triệu chứng — nó được — [chi tiết](docs/instruction/B150-chat-mat-han-khi-nguoi-choi-rot-mang.md)
- **B151.** **Đừng nhầm với B104** — B104 là bàn cờ vô tình *tạo* focus cho chat, B151 là chat *giữ* — [chi tiết](docs/instruction/B151-quick-chat-input-giu-focus-sau-khi-tap-board.md)
- **B152.** (✅ Đã làm 2026-08-24 — `fix/game-move-ack-timeout-resync` off `dev`; chi tiết thực thi ở… — [chi tiết](docs/instruction/B152-game-move-khong-co-ack-timeout-retry-gay-freeze.md)
- **B153.** (✅ Đã làm 2026-08-24 — cùng branch `fix/game-move-ack-timeout-resync` off `dev`, commit — [chi tiết](docs/instruction/B153-optimistic-render-quan-co-cua-chinh-minh.md)
- **B154.** (✅ Đã làm 2026-08-26 — `fix/turn-watchdog-resync-deadlock` off `dev`; chi tiết ở — [chi tiết](docs/instruction/B154-gap-detection-khong-pha-duoc-deadlock-2-nguoi.md)
- **B155.** (✅ Đã làm 2026-08-26 — `feature/full-csp-zero-latency` off `dev`, `?v=155`. **Lệch có — [chi tiết](docs/instruction/B155-full-csp-am-thanh-luot-di-tuc-thi-0ms.md)
- **B156.** Sửa ở `GameHandler.js:442` (nhánh `mode === 'opening'` trong `game:undo_accept`) — sau — [chi tiết](docs/instruction/B156-swap2-opening-undo-accept-popup-khong-bien-mat.md)
- **B157.** (Đã làm) Sửa `renderUsersList()` trong `client/js/room-ui.js` — nhánh mới gọi lại
  `renderStatusDot()` (đã dùng cho player ngồi ghế, cùng file) cho guest có `presence ===
  'disconnected'`/`'away'`, không hiện chấm nào khi guest bình thường (giữ nguyên nguyên tắc giảm
  nhiễu của `renderStatusDot`). Bọc `user-name`+chấm trong `.user-name-group` mới thay vì thả thẳng
  chấm là con thứ 3 của `<li>` — `.users-list li` dùng `justify-content: space-between` cho đúng 2
  cột (tên | nút mời ra), thêm 1 con nữa sẽ phá bố cục đó. **Không đụng** `TODO.md #115` (viewer-ma
  nằm lại `room.users` vô thời hạn — hành vi đã chốt) hay bất kỳ file `server/` nào — dữ liệu
  `presence` server gửi đã đúng sẵn từ #113/#115, đây thuần là fix hiển thị phía client. Bug có trên
  cả `main` (đã xác nhận bằng `git show main:client/js/room-ui.js`, không phải hành vi riêng của
  `dev`) ⇒ branch `fix/viewer-list-presence-indicator` off `main`, theo đúng tiền lệ B92. `client/js/`
  CÓ hạ tầng test jsdom (tiền lệ B134's `room-zen-drawer-collapsed-recovery.test.js`) — viết 4 test
  mới `client/tests/room-ui-viewer-presence-dot.test.js` thay vì bỏ qua; nạp `escape-utils.js` thủ
  công qua `window.EscapeUtils = require(...)` trước `room-ui.js` vì UMD export không tự gắn vào
  `global` khi chạy dưới Jest/CommonJS (khác nhánh browser). `?v=138→139` trên `main`; merge vào
  `dev` re-bump theo `max(dev,main)+1` thành `155→156` (báo cáo người dùng, TODO.md #157) — [chi
  tiết](docs/instruction/B157-viewer-list-khong-hien-thi-trang-thai-mat-ket-noi.md)
- **B158.** Sửa `RoomManager.listRooms()` (`server/managers/RoomManager.js:614-638`), đổi — [chi tiết](docs/instruction/B158-loi-phong-o-sanh-dem-ca-viewer-ma.md)
- **B159.** Chat riêng 1-1 ở Sảnh. Thứ tự: (1) đổi shape `getOnlineUsersList()` (`state.js:67`) → — [chi tiết](docs/instruction/B159-private-chat-1-1-sanh.md)
- **B160.** Gỡ bỏ hoàn toàn Dark UI Mode (người dùng quyết định gỡ, không hoàn thiện). Xoá code — [chi tiết](docs/instruction/B160-go-bo-dark-ui-mode.md)
- **B161.** Gộp Density Mode về Lite + Default, bỏ Pro. Sửa `ui-mode.js` trước (`MODES` còn 2 phần — [chi tiết](docs/instruction/B161-gop-2-che-do-ui-lite-default-bo-pro.md)
- **B162.** CHỈ sửa CSS `.score-table` (`room.css` ~369–387): thêm `border-right` cho — [chi tiết](docs/instruction/B162-score-table-thieu-duong-ke-cot-kho-doc.md)
- **B163.** Viết lại `generateGuestName()` (`server/routes/auth.js:246`) → `'guest' + — [chi tiết](docs/instruction/B163-guest-name-guest-plus-4-digits.md)
- **B164.** `server/utils/logger.js`: thêm `LOG_FORMAT=pretty|logfmt|auto` (auto = pretty khi — [chi tiết](docs/instruction/B164-server-log-logfmt-va-ip-geo.md)
- **B165.** ĐO `d` (one-way delay) thật trước khi chọn cách bù — nếu chỉ ~50ms thì cú nhảy 3s có — [chi tiết](docs/instruction/B165-timer-nhay-do-transit-delay-predictedturn-desktop.md)
- **B166.** Tiên quyết: B165 xong + cơ chế bù trễ đã chốt — viết chi tiết hàm SAU đó, đừng đoán. — [chi tiết](docs/instruction/B166-port-co-che-bu-tre-timer-sang-mobile-players-strip.md)
- **B167.** Task KHẢO SÁT — dừng và hỏi người dùng sau bước ĐO trước khi viết code. Đo
  `serverRecv − turnStart` (monotonic `process.hrtime`) vs `measuredHalfRTT` server-side trên
  production. Nếu B165 đã đủ → đóng "không cần". Nếu làm: clamp `refund` (test case đầu tiên:
  `clientTs = turnStart` → refund vẫn ≤ HARD_CAP), lag-budget/ván, đo lag server-side, `clientTs`
  chỉ cross-check. Điểm chèn: method mới trên `TimerManager`, không rải logic ra `GameHandler`.
  KHÔNG siết `pingInterval`/`pingTimeout` toàn cục (bẫy #147/#152). Cân nhắc bỏ refund cho `per_move`.
  Kênh lấy mẫu Bước 1 đã có thêm trang #168 (`/diag`) — đọc `server/data/diag-results/*.jsonl`; spec
  Bước 2 không đổi vì #168 (trang chỉ đo, `clientTs` vẫn chỉ cross-check). **Sau mẫu lần 2
  (2026-08-28):** đã loại giả thuyết bàn giao c→s→c (`timerHandoff ≈ moveConfirm` cả 5 lượt) —
  **đừng đi tối ưu đường bàn giao**. **OQ1 chặn cứng Bước 2**: chưa có nguồn đo half-RTT server-side
  mỗi nước hợp lệ — dừng và chốt với người dùng trước khi code (hướng đáng cân nhắc: mượn cơ chế
  `diag:ping`/`diag:pong` của #168, nhưng phải hỏi vì thêm message type vào phòng chơi). **OQ2**:
  đừng vội nâng `HARD_CAP` theo 1 điểm dữ liệu. Muốn giảm khó chịu ngay → làm **#169** thay vì #167 —
  [chi tiết](docs/instruction/B167-khao-sat-server-side-lag-compensation-move.md)
- **B168.** Không phải task khảo sát — open question đã chốt hết ở `features/diagnostic-latency-page/`. — [chi tiết](docs/instruction/B168-trang-chan-doan-do-tre-nguoi-choi-tu-kiem-tra.md)
- **B169.** Ranh giới cứng: **chỉ đường hiển thị** — `activeDeadline`/`serverNow()`/`clockOffsetMs`/ — [chi tiết](docs/instruction/B169-dong-ho-giat-nhay-tren-ket-noi-jitter-cao.md)
- **B170.** **Rà 2026-08-29: bẫy chính ĐÃ XÁC NHẬN LÀ THẬT** — `clockOffsetMs` chỉ gán ở — [chi tiết](docs/instruction/B170-ready-deadline-countdown-dung-date-now-tho.md)
