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
- **A130.** Tunnel `cloudflared` — **đã điều tra xong, không phải lỗi**; giữ file làm bản ghi âm tính để chặn điều tra lặp. Bài học phương pháp: metrics chỉ nói *bao nhiêu lần*, `journalctl -u cloudflared` mới nói *vì sao / lúc nào* — đọc log trước khi kết luận. KHÔNG đổi `--protocol http2` dựa trên số lần re-register (TODO.md #130) — [chi tiết](docs/instruction/A130-cloudflared-quic-flap-chuyen-sang-protocol-http2.md)

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
- **B104.** (Đã làm) Mobile: chạm bảng cờ làm chatbox active & trang tự cuộn — dời `e.preventDefault()` lên trước guard sớm-thoát trong `_onTouchEnd` (board.js), thêm `touch-action: none` cho `.board-canvas-wrap canvas` (game.css) khớp `#match-canvas`; viết unit test jsdom mới cho `_onTouchEnd`, xác nhận test bắt được lỗi trên code cũ trước khi merge (báo cáo người dùng, TODO.md #104) — [chi tiết](docs/instruction/B104-mobile-chatbox-active-va-scroll-khi-tap-board.md)
- **B105.** (Chưa làm) Thêm `compression` middleware trước `express.static`; đặt kỳ vọng cho đúng — CF đã nén Brotli cho người dùng cuối rồi, mục này KHÔNG phải fix cho triệu chứng "sometime lag" (đó là B106), chỉ lợi chặng origin→CF và dev/test; KHÔNG đụng `perMessageDeflate` của socket.io (ảnh hưởng độ trễ realtime — ngoài phạm vi), không chỉnh `level`/`threshold` nếu không có số đo (báo cáo người dùng, TODO.md #105) — [chi tiết](docs/instruction/B105-khong-co-compression-middleware.md)
- **B106.** (Chưa làm) **Ưu tiên cao nhất nhóm #105-#110.** Truyền `setHeaders` cho `express.static`: `*.html` → `no-cache` (KHÔNG cache dài — HTML chứa chính số `?v=N`, cache lâu sẽ tái tạo lớp bug #51), phần còn lại → `max-age=31536000, immutable` (an toàn nhờ `?v=N` sẵn có); xác minh ở CẢ origin lẫn domain thật — `cf-cache-status` phải chuyển `REVALIDATED` → `HIT`, đừng coi là xong chỉ vì header ở localhost đúng; kiểm lại `no-store` của #66 trên `/api/auth/*` không bị ghi đè; KHÔNG đụng dashboard Cloudflare (tunnel chạy bằng token, cấu hình ngoài repo, quyền người dùng) (báo cáo người dùng, TODO.md #106) — [chi tiết](docs/instruction/B106-cache-control-max-age-0-ep-revalidate-moi-request.md)
- **B107.** (Chưa làm) Đổi `socket.io.js` → `socket.io.min.js` ở đúng 4 file HTML, sửa cả 4 không sửa lẻ (kiểm bằng `grep -rn "socket.io/socket.io" client/*.html` ra 4 dòng đều `.min.js`); **KHÔNG thêm `?v=N`** vào URL này (do server socket.io phục vụ, không thuộc cơ chế cache-busting của repo); không đổi sang `.esm.min.js` (các trang dựa vào global `io`, rủi ro cao hơn lợi ích 6 KB); không nâng/hạ phiên bản `socket.io` (xem #89) (báo cáo người dùng, TODO.md #107) — [chi tiết](docs/instruction/B107-socket-io-ban-debug-khong-minify.md)
- **B108.** (GĐ1 đã làm 2026-08-12; GĐ2 đóng, không làm) Chia 2 giai đoạn theo rủi ro: GĐ1 (thấp) bỏ `<link>` bold ở 3 trang không dùng + đổi `font-display: block` → `swap`, nhưng grep xác nhận `ph-bold` không được sinh động từ JS mà trang đó nạp trước khi bỏ; GĐ2 (cao) subset 45 icon — **đừng tin con số 45 từ grep tĩnh**, phải soát chỗ ghép chuỗi `` `ph-${...}` `` trước, chế độ hỏng là icon biến mất IM LẶNG (không lỗi console, không fail test), không chắc 100% thì không làm; **người dùng đã chốt đóng GĐ2 trên đúng cơ sở này** (2026-08-12) — nếu sau này mở lại, phải bịt lỗ grep-tĩnh ở `tournament-match.js:721,760` trước, không chạy thẳng công cụ subset trên con số 45 cũ; nhớ bump `?v=N`; không thay Phosphor bằng thư viện khác, không đụng `manrope/` (đã cấu hình đúng) (báo cáo người dùng, TODO.md #108) — [chi tiết](docs/instruction/B108-phosphor-icon-font-qua-nang.md)
- **B109.** (Chưa làm) **Rủi ro cao nhất nhóm, làm SAU CÙNG và phải hỏi người dùng trước** (họ vận hành server thật). Tuyệt đối không chỉ đặt `NODE_ENV=production` — `dist/` cũ hơn `client/` 4 ngày, làm vậy đẩy production lùi về trước #103/#104/#95-#102; thứ tự bắt buộc: build lại → xác minh nội dung `dist/` khớp `client/` (mở file kiểm chứng, không chỉ xem timestamp) → rồi mới bàn `NODE_ENV`; vấn đề thật là quy trình (không gì đảm bảo `dist/` được build lại) chứ không phải biến env; KHÔNG sửa `copyClassicScripts()` trong `vite.config.js` trừ khi build thật sự hỏng; đọc tiền lệ #65 trước khi làm (báo cáo người dùng, TODO.md #109) — [chi tiết](docs/instruction/B109-production-chay-che-do-dev-dist-cu.md)
- **B110.** (Chưa làm) Ưu tiên thấp nhất — cân nhắc ĐÓNG thay vì làm nếu #105-#108 đã đủ nhanh (lợi thật chỉ ~8-9 KB sau nén); nếu làm thì giữ `vi` nội tuyến, chỉ tách `en` nạp động khi người dùng đổi ngôn ngữ — **đừng biến `i18n.js` thành module bất đồng bộ** (`t()` đang gọi được từ top-level, số call site rất lớn); xử lý trường hợp `localStorage` đã chọn `en` từ trước để tránh nháy ngôn ngữ (báo cáo người dùng, TODO.md #110) — [chi tiết](docs/instruction/B110-i18n-ship-ca-2-ngon-ngu.md)
- **B111.** (Chưa làm) Lỗ hổng còn lại của B106, phát hiện khi đo lại: file client socket.io do `serveClient` của socket.io phục vụ, ngoài tầm `staticOptions`. **Pitfall chính: URL không có `?v=N` nên TUYỆT ĐỐI không dán `max-age=31536000, immutable`** (nâng cấp socket.io sẽ ghim client cũ tới 1 năm → "kết nối được nhưng vài event im lặng không chạy", cực khó chẩn đoán); khuyến nghị TTL vừa phải (vd. `max-age=86400`) thay vì tự phục vụ lại. Đừng đặt `serveClient: false` mà quên route thay thế (4 trang mất global `io` → hỏng toàn site ngay); đừng nhét ngoại lệ này vào `server/config/staticCache.js` (17 test đang bám ngữ nghĩa "chỉ cho asset của `client/`"); đừng gộp commit với B105 dù cùng đụng `server/index.js`; bắt buộc có unit test chứng minh không phá B106 (`*.html` `no-cache`, asset `immutable`) lẫn #66 (`/api/auth/*` `no-store`) (đo lại sau #106/#107/#108, TODO.md #111) — [chi tiết](docs/instruction/B111-socket-io-client-bo-qua-static-cache-control.md)

## "Đừng làm" — reviewer chỉ rõ ranh giới không nên đụng

- **Đừng chuyển `game:moved` sang delta** — đã là delta tối ưu (121 B/nước,
  ngang mức tối ưu của dự án cùng bài toán). Không có việc gì để làm ở đây.
- **Đừng đụng `client/js/socket-client.js:40`** — cách chọn `ws://`/`wss://`
  theo origin đã đúng, sửa vào đây có thể tạo lại đúng lỗi TLS đang tránh.
- **Đừng nới rate limiter trong code production chỉ để tự test được** (xem quy
  tắc chung #0) — nếu cần test hơn 20 "người dùng", restart server giữa các đợt
  thay vì đổi ngưỡng.
- **Đừng sửa file gốc để chạy mutation test** — luôn copy sang thư mục tạm.
- **B112.** (Chưa làm) **Hỏi người dùng chọn (A) tắt Web Analytics trên dashboard hay (B) nới CSP trước khi viết code** — câu hỏi thật là "có dùng số liệu đó không", không phải câu hỏi kỹ thuật; nếu (A) thì không có gì để commit (việc trên dashboard, agent không làm được). Nếu (B): pin đúng host `https://static.cloudflareinsights.com` vào `scriptSrc`, **KHÔNG wildcard**, và **phải đo `connectSrc`** vì beacon còn POST số liệu về (không đo thì script tải được nhưng vẫn không có dữ liệu); cập nhật `server/tests/csp.test.js`. Đừng thêm `'unsafe-inline'`/`'unsafe-eval'` (#65 vừa dọn), đừng tắt CSP, đừng sửa `client/` (repo không hề tham chiếu beacon — Cloudflare chèn ở biên). Xác minh **chỉ bằng Chromium thật**, curl không thấy beacon (xác minh nhóm #105-#111, TODO.md #112) — [chi tiết](docs/instruction/B112-cloudflare-insights-beacon-bi-csp-chan.md)
- **B113.** (Đã làm) Branch off `dev`, không phải `ui/*` đang mở, vì đụng `server/` (backend-locked trên `ui/*`); `disconnected` phải server-authoritative — `RoomManager.setPresence()` chỉ nhận `active`/`away` từ client và no-op nếu đang `disconnected`, chỉ `DisconnectHandler.js`/`SocketHandler.js` được set/clear nó; phải broadcast ở đủ 6 điểm start/cancel-grace, thiếu 1 điểm là dot kẹt sai cho tới `room:updated` kế tiếp — có test inventory đếm số lần gọi `broadcastRoomUpdate(io` để bắt thiếu sót này; xác minh bắt buộc bằng Playwright 2 trình duyệt thật (không chỉ unit test) vì tính năng chỉ có ý nghĩa khi 1 người thấy trạng thái của người khác đổi theo thời gian thực; set `CORS_ORIGIN=http://localhost:<port>` khi chạy server xác minh cục bộ (mặc định trỏ domain production, socket.io handshake từ localhost bị chặn); dọn dẹp server xác minh phải kill theo PID cụ thể, **tuyệt đối không `pkill -f "node server/index.js"`** (rủi ro giết nhầm server khác không do agent khởi động — đã xảy ra) (yêu cầu người dùng qua chat, TODO.md #113) — [chi tiết](docs/instruction/B113-slot-status-presence.md)
- **B114.** (Chưa làm) Đổi nguồn Active/Inactive của slot dot từ `player.ready` sang `room.state === 'playing'` — **KHÔNG phải idle-timer/activity-tracking** (đã bị người dùng bác ở vòng hỏi lại đầu tiên, đừng đề xuất lại); phạm vi CHỈ 2 slot người chơi, không phải toàn phòng; giữ nguyên `ready` cho Start modal, chỉ gỡ nó khỏi `playerStatusInfo()`; giữ nguyên thứ tự ưu tiên disconnected > away(Leave) > Active/Inactive như #113; client-only, không cần branch backend-lock; hỏi lại nhãn tiếng Việt + bảng màu trước khi code (TODO.md #114) — [chi tiết](docs/instruction/B114-slot-status-active-inactive-thay-ready.md)
- **B115.** (Đã làm) Tách nhánh cuối của `handleDisconnect()` (`DisconnectHandler.js:37-79`) theo `slot`: `slot === null` (Viewer thật) → bỏ hẳn timeout, chỉ set `presence = 'disconnected'` + broadcast, không đuổi theo thời gian; `slot === 1|2` (player, ván chưa `ongoing`) → **giữ nguyên** `startSpectatorGrace` 30s cũ, không đổi theo — phạm vi CHỈ role Viewer đúng nghĩa người dùng dùng trong báo cáo, không mở rộng vô hạn cho player chưa vào ván; **KHÔNG đụng** `startDisconnectGrace` (player trong ván `ongoing`, 60s) và `startEmptyRoomGrace` (người-duy-nhất-còn-lại, 20s) — 2 case khác, ngoài phạm vi yêu cầu này; **đã chốt (2026-08-14), không cần hỏi lại**: phòng còn tồn tại → Viewer reconnect lúc nào cũng được; phòng đã huỷ → về sảnh chờ (`ROOM_GONE` sẵn có); "viewer ma" nằm lại `room.users` tới khi phòng tự huỷ là tác dụng phụ chấp nhận được, KHÔNG thêm cơ chế dọn dẹp riêng; `RoomManager.joinRoom()` đã coi "còn trong `room.users`" là reconnect hợp lệ vô điều kiện thời gian nên không cần sửa; branch `fix/viewer-reconnect-unlimited` off `main` (code identical trên `main`/`dev`, không phải trường hợp ngoại lệ off-`dev`); test inventory call-site của B113 (`server/tests/RoomManager.test.js`) phải cập nhật đếm khi thêm điểm gọi `broadcastRoomUpdate(io` mới (báo cáo người dùng qua chat, TODO.md #115) — [chi tiết](docs/instruction/B115-viewer-reconnect-khong-gioi-han-thoi-gian.md)
- **B116.** (Đã làm) **Phạm vi là `client/room.html`/`client/js/room-ui.js` (phòng chơi thường),
  KHÔNG PHẢI `tournament-match.html`** (sửa lại 2026-08-14 sau khi người dùng xác nhận — bản ghi đầu
  do agent nhầm vì 2 trang dùng cấu trúc `.panel-players`→`.score-panel`→`.sidebar-tabs` gần giống
  hệt). `.score-panel`/`.score-table` (`client/css/room.css:350`) dùng chung class với
  `tournament-match.html` — CSS layout scope riêng cho `room.html` qua `#tab-score .score-panel`,
  không sửa `.score-panel` chung chung để không ảnh hưởng tournament-match. Score-panel chuyển từ
  fixed-above-tabs sang tab-content `#tab-score` mới, phối hợp với logic switch-tab sẵn có ở
  `client/js/room-ui.js` (theo `data-tab`) thay vì generic `style.display` độc lập, cùng khuôn mẫu
  ẩn/hiện tab-users đã có. `room.html` chỉ có 3 tab gốc (Trò chuyện/Khán giả/Cài đặt), khác
  tournament-match (Nước đi/Trò chuyện/Khán giả) — không copy nhầm logic. `?v=` 119→120. Xác minh
  bằng Playwright thật ở kích thước mobile với 2 người chơi đã có kết quả Thắng/Bại/Hoà trước đó
  (bảng điểm chỉ hiện khi có dữ liệu), không chỉ sửa CSS rồi đoán (báo cáo người dùng qua chat kèm
  ảnh chụp màn hình, TODO.md #116) — [chi tiết](docs/instruction/B116-tournament-match-scoreboard-lan-chiem-mobile-chat.md)
- **B117.** (Đã làm) Bug hiệu năng thuần client, không đụng server — `_diffLobbyRooms`/
  `broadcastLobbyUpdate` (`server/socket/state.js`) đã đúng, không sửa lại phần diff/debounce phía
  server. `client/js/lobby.js`: `buildRoomRowHtml()` build 1 hàng dùng chung cho full-render và
  hàng mới qua patch; `updateRoomRowNode()` cập nhật tại chỗ 1 node đã có, không đụng animation;
  `applyLobbyPatch()` áp `upserts`/`removed` thẳng lên DOM qua `data-room-id`, chỉ fallback
  full-render khi vượt biên rỗng↔không-rỗng; `renderRoomList()` giữ nguyên cho `lobby:update`/
  `langchange`/`uimodechange`. `?v=` 118→119. Không có Jest cho `client/js/`; xác minh bằng spec
  Playwright mới `e2e/lobby-patch-incremental-render.spec.ts` (giữ lại vĩnh viễn trong bộ e2e sẵn
  có, không phải script tạm) — `MutationObserver` thật trên Chromium xác nhận chỉ đúng 1 phòng bị
  đụng DOM khi 1 phòng đổi giữa nhiều phòng khác (báo cáo người dùng qua chat, TODO.md #117) —
  [chi tiết](docs/instruction/B117-lobby-render-lai-toan-bo-khi-patch.md)
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
- **B119.** (Đã làm) Guest bấm "Create account" trong Settings không vào được form đăng ký — sửa
  đúng lớp gốc `client/js/login.js` `checkExistingSession()`, KHÔNG sửa nút `<a href="login.html">`
  trong `settings-panel.js` (đã đúng); thêm điều kiện chỉ auto-bounce về `index.html` khi có session
  thật (đọc field `isGuest` từ `GvnSession.getUser()`, KHÔNG bounce guest); không tự ý log out guest
  session hiện tại; đã kiểm tra `socket-client.js:39`/`session.js:127-131`'s `hasBelievedSession()`
  khác — không cần sửa, hướng ngược lại (page-guard cho trang cần đăng nhập, guest vẫn hợp lệ ở đó);
  3 test mới trong `login-oauth-error-banner.test.js` (báo cáo người dùng kèm ảnh Settings, TODO.md
  #119) — [chi tiết](docs/instruction/B119-guest-khong-tao-duoc-tai-khoan-tu-nut-create-account.md)
- **B120.** (Đã làm) Login page thiếu Language Toggle — KHÔNG viết lại `createLangSwitcher()`/
  `setLanguage()`/`getLanguage()` (`i18n.js`, đã hoàn chỉnh); thêm mount point mới
  `.login-lang-switch-row` trong `login.html` (trong `.split-right`, trên `.login-shell`) + CSS căn
  phải khớp `max-width: 440px` của `.login-shell` trong `login.css`; đổi đúng dòng `i18n.js:1340`
  `document.querySelector('.card__logo')` sang selector mới; đã `grep -rn "card__logo" client/`
  trước khi đổi — không có HTML nào khác chờ selector cũ; không đụng `.card__logo .lang-switch`
  (CSS chết trong `main.css`, để nguyên); xác minh bằng Playwright thật (desktop + mobile 390×844)
  qua static server cục bộ thay vì `server/index.js` (trang login không cần backend để test riêng
  switcher này, tránh mọi rủi ro đụng database thật); `?v=` 122→123 (báo cáo người dùng trực tiếp,
  TODO.md #120) — [chi tiết](docs/instruction/B120-login-html-thieu-language-toggle-do-selector-cu-hong.md)
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
- **B124.** (Đã làm) Đổi `forwarded.split(',')[0].trim()` → `.pop().trim()` ở
  `get-client-ip.js:48`, đúng 1 dòng, không đụng nhánh `CF-Connecting-IP`/điều kiện loopback; thêm
  case multi-value XFF vào `get-client-ip.test.js` (review vòng 4 mục 13.11, nuance mới hơn B44,
  TODO.md #124) — [chi tiết](docs/instruction/B124-getclientip-xff-lay-phan-tu-cuoi-thay-vi-dau.md)
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
- **B131.** (Chưa làm) `timeout: 8000` cho `io({...})` trong `client/js/socket-client.js` — đúng 1 dòng; **giữ nguyên** `transports: ['websocket','polling']` + `tryAllTransports` (đã đo, comment tại chỗ) dù websocket là thứ chậm trong HAR — mất gói ở tầng TCP/SYN nên polling-first dính y hệt; giữ nguyên mọi tham số `reconnection*`; không sửa eviction/`session:kicked` ở `SocketHandler.js` "cho chắc"; bump `?v=130→131` toàn bộ và verify bằng grep; `client/js/` không có test tự động — nói rõ điều đó thay vì bỏ qua im lặng (TODO.md #131) — [chi tiết](docs/instruction/B131-socket-io-client-timeout-20s-qua-lau.md)
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
- **B134.** (Đã làm) Nguyên nhân: `client/js/room-socket.js`'s `game:init` check
  `matchMedia('(max-width: 768px)')` một lần duy nhất rồi thêm `zen-drawer-collapsed` — không có
  chỗ nào gỡ class khi viewport rộng lại (bẫy một chiều, xác nhận bằng người dùng tái hiện kèm
  DevTools: `body.zen-drawer-collapsed` kẹt ở viewport 1920×935). Sửa: thêm
  `matchMedia(...).addEventListener('change', ...)` trong `client/js/room.js` ngay sau
  `refitBoardAfterDrawer()` — **chỉ gỡ** class khi `!e.matches` (viewport hết hẹp), không bao giờ
  tự thêm (auto-collapse mobile vẫn là việc riêng của `game:init`, không đổi); không đổi breakpoint
  768px hay cơ chế co giãn width/overflow-clip/flex-end hiện có của `.panel-right-shell`
  (`room-zen.css:408-455`, cố ý tránh reflow chữ). 4 test mới
  `client/tests/room-zen-drawer-collapsed-recovery.test.js` (decision table đủ 4 tổ hợp class
  có/không × viewport hẹp/rộng; kiểm chứng không rỗng bằng `git stash` chỉ `room.js` → đúng 1/4
  fail), `npm test` 1147/1147. `?v=135→136` (báo cáo người dùng kèm ảnh chụp PC + DevTools, TODO.md
  #134) — [chi tiết](docs/instruction/B134-sidebar-tab-thut-vao-trong-khi-redraw.md)
