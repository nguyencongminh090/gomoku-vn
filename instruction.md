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
- **B137.** **Không** chuyển `#start-modal` thành con của `#board-area`: `GameUI.initBoard()` ghi đè
  `innerHTML` của `#board-area` trọn gói ở lần render đầu, modal sẽ bị xoá mất — lý do này đã ghi
  sẵn trong comment `client/room.html:89` và `client/css/room.css:54-56`, đừng phát hiện lại bằng
  cách làm hỏng. Hướng an toàn: giữ nguyên anchor, chỉnh vùng phủ trong `room-zen.css` để tôn trọng
  `padding-right` của shell. Không đụng `.game-overlay` (`#room-entry-overlay` dùng chung class đó,
  §B36). Đo trước/sau bằng Playwright: tâm thẻ modal vs tâm canvas, ở cả 2 trạng thái drawer × 2
  viewport — [chi tiết](docs/instruction/B137-start-modal-phu-tron-viewport-de-len-drawer.md)
- **B138.** `inert` là **thuộc tính DOM**, không set được bằng CSS ⇒ phải móc vào **cả 3** nơi đổi
  `zen-drawer-collapsed` (danh sách trong `docs/todo/B136-*.md`), nếu không sẽ sinh ra nguồn sự thật
  thứ tư lệch pha. Tuyệt đối **không** đặt `inert`/`aria-hidden` lên `.sidebar-tabs` — rail là cách
  duy nhất mở lại drawer. Nhớ nhánh mobile ≤768px: cùng class nhưng cơ chế là
  `transform: translateY()` trên sheet (`room-zen.css:934-958`), nội dung cũng nằm ngoài màn hình và
  cần cùng cách xử lý — [chi tiết](docs/instruction/B138-drawer-dong-chi-la-clip-noi-dung-van-focus-duoc.md)
- **B139.** Giữ `pointer-events: none` trên `.start-modal` (§B36) — sửa **thang z-index**, đừng đổi
  mô hình click. Thang mobile hiện có (comment `room-zen.css:944-951`): sheet 700 > quick-chat-bar
  650 > float-messages 550; nâng `.start-modal` phải lên **trên 700** và ghi vào đúng comment đó.
  **Không** dùng phương án "modal hiện thì tự thêm `zen-drawer-collapsed`" — tạo nguồn sự thật thứ
  tư cho class đang là tâm điểm #134/#136 và nuốt lựa chọn thủ công của người dùng. Verify bằng
  **chạm thật** `page.click('#start-modal-btn')`; `el.click()` qua `evaluate` bỏ qua hit-testing nên
  pass giả — [chi tiết](docs/instruction/B139-mobile-nut-bat-dau-bi-bottom-sheet-che.md)
- **B141.** Tách bạch hai phần: đua `?id=` là **bug thật của spec**, sửa một dòng
  (`waitForURL(/room\.html\?id=/)`), không cần hỏi; còn `authLimiter` 20/15 phút và
  `MAX_ROOMS_PER_IP=3` **không phải bug** mà là chống lạm dụng có chủ đích (`docs/todo/B07-*.md`) —
  chốt cách nới **chỉ cho harness** với người dùng trước, đừng hạ ngưỡng mặc định. Đừng thay
  `waitForURL` bằng `waitForTimeout` (che cuộc đua, không loại bỏ). Khi một spec e2e fail, khởi động
  lại server (store limiter nằm trong bộ nhớ) rồi chạy **riêng** spec đó trước khi kết luận hồi quy —
  [chi tiết](docs/instruction/B141-e2e-flaky-room-url-race-va-rate-limit.md)
- **B142.** `1fr` == `minmax(auto, 1fr)`; cái `auto` là **min-content của grid item**, và trong một
  grid **rộng cố định** có track cỡ cố định bên cạnh, nội dung dài sẽ **đẩy track cố định ra ngoài
  container** chứ không tự cắt ⇒ phải là `minmax(0, 1fr)`. `min-width: 0` **không** thay thế được
  (chỉ hạ ngưỡng co của flex item, không hạ min-content nội tại) — `.slot-card` đã có sẵn mà vẫn
  lỗi, đừng đi lại đường đó. **Bẫy kiểm chứng: tài khoản khách KHÔNG tái hiện được** (tên tự sinh
  cho min-content 277px < track 283px) — phải đăng ký tài khoản thật tên dài (2–24 ký tự,
  `isValidDisplayName`). Đo bằng `getBoundingClientRect()` của `.sidebar-tabs` so với
  `.panel-right-shell`, đừng tin `getComputedStyle().gridTemplateColumns` một mình. Không đụng
  `overflow:hidden`/`flex-end`/width cố định (§B138 — cắt xén là chủ ý) và không đụng nhánh mobile
  ≤768px — [chi tiết](docs/instruction/B142-grid-track-1fr-day-rail-ra-khoi-drawer.md)
- **B143.** `min-width/min-height: 32px` của `.slot-card__stand` là **ngưỡng vùng chạm mobile** — hạ
  thì phải kiểm chứng bằng chạm thật trên viewport điện thoại. Tuyệt đối **không** gỡ
  `minmax(0, 1fr)` của #142 để "trả chỗ cho tên" (tái phát #142). Giữ ellipsis làm dự phòng dù chọn
  hướng nào — [chi tiết](docs/instruction/B143-nut-dung-day-bop-ten-nguoi-choi.md)
- **B144.** Chốt phương án tương tác (vuốt / nút `V`) bằng `AskUserQuestion` **trước** khi code —
  người dùng chưa chọn. `--zen-topnav-h` là biến hình học chịu lực (11 chỗ `calc()` +
  `board.js` `shellTop`), ẩn nav mà không xử lý chúng chỉ đổi 60px chrome thành 60px khoảng trống.
  Không được ẩn mất **nút rời phòng** và **mã phòng** — hai thứ này chỉ có ở topnav. `.topnav` dùng
  chung 5 trang nên mọi rule phải khoá trong `body.zen-room` + media mobile. `client/js/board.js`
  đang bị khoá: nếu buộc phải sửa thì dừng và hỏi. Đo bắt buộc trên **cả** Pixel 5 lẫn iPhone SE —
  [chi tiết](docs/instruction/B144-an-topnav-tren-mobile-phong-choi.md)
- **B145.** Rủi ro số một là **hai instance socket** — #51 đã từng gây đúng vậy (`?v=` lệch ⇒
  `lobby.js` chạy 2 lần ⇒ 2 kết nối ⇒ bị server đá với "đăng nhập ở thiết bị khác"). Bản sửa này
  **cố ý** tách chỗ tạo socket khỏi chỗ dùng socket, tức tự tạo ra đúng điều kiện đó: khởi tạo sớm
  phải idempotent, `SocketClient` phải **nhận lại** socket chứ không gọi `io()` lần hai, và nghiệm
  thu là **đếm được đúng 1 kết nối**, không phải "trang chạy được". Bump `?v=N` đầy đủ (`grep -rn
  "?v=" client/*.html client/js/*.js | grep -v mockup` ra đúng 1 giá trị) — thiếu một chỗ vừa gây
  bug cache vừa tái hiện chính bug trên. Làm `index.html` **trước**, đo, rồi mới nhân ra 3 trang
  còn lại (`room.js` dùng `window.RoomClient`, `lobby.js` dùng `export const` — khác nhau, đừng
  giả định đồng nhất). Không đụng `requireAuth()` (guard cố ý lạc quan), không đụng thứ tự transport
  / `reconnection*` / `timeout: 12000` (đã hiệu chỉnh bằng số đo ở #28/#29 và #131). Khi đo, báo cáo
  khoảng cách **`navigationStart` → socket `connect`**, KHÔNG phải `entry.time` của WebSocket — 543 ms
  không phải thứ mục này làm giảm, báo nhầm mốc sẽ trông như bản sửa vô tác dụng; và phải đo **qua
  domain thật** (trên localhost `connect` ≈ 0 ms). `client/tests/` **có** hạ tầng jsdom thật —
  #131 đã ghi lại bài học khẳng định nhầm điều ngược lại — [chi tiết](docs/instruction/B145-socket-mo-qua-muon-trong-doi-trang.md)
- **B146.** **Đo trước, đừng tin #81**: bench cũ đo đường ĐỌC, mục này là lệnh GHI — mở rộng
  `bench-session-lookup.js` đo `db.touchSession` riêng, gồm cả lúc WAL đang tranh chấp. Nếu vẫn là
  µs thì **đóng như tradeoff đã đo**, đừng sửa cho có. Mặc định là hướng 1 (gọi sau `next()` /
  `setImmediate`); hướng 2 (chỉ ghi khi `last_seen` cũ hơn N phút) **đổi ngữ nghĩa của cột** ⇒ phải
  grep ai đang đọc nó và phải hỏi người dùng — đừng "tiện tay" làm cả hai. Bẫy: giữ nguyên
  `try/catch` bên trong `touchSession()` khi chuyển ra `setImmediate` — exception trong callback
  **không** bị `try/catch` ở call site bắt, nó rơi thẳng xuống `uncaughtException`. Không sắp xếp
  lại logic auth: nhánh "cookie chết thì KHÔNG rơi xuống legacy JWT" là chống hồi sinh session đã
  thu hồi; `getValidSession()` phải ở nguyên trên đường tới hạn (đó là xác thực thật, không phải
  bookkeeping) — [chi tiết](docs/instruction/B146-touchsession-ghi-sqlite-dong-bo-chan-truoc-101.md)
- **B147.** **Dừng và hỏi người dùng trước khi viết code** — không phải "bật một cờ". Ba vùng nguy
  hiểm: (1) `auth.reconnect` — phải trả lời được "socket.io có còn đặt cờ này trên đường recovery
  không?" bằng cách đọc `node_modules` + dựng thử, KHÔNG suy từ tài liệu; nếu không thì mọi lần rớt
  mạng sẽ đá người chơi về login, hồi quy nặng hơn lợi ích. (2) `skipMiddlewares: true` bỏ qua **cả**
  `verifySocketToken` lẫn chống flood ⇒ session đã **thu hồi sẽ sống lại**, phá đúng cái #68 xây —
  để `false`, muốn middleware rẻ hơn thì làm #146. (3) `maxDisconnectionDuration` phải chọn **đối
  chiếu với** các hằng grace hiện có (`SPECTATOR_GRACE_MS`…, #115 vừa chỉnh), không copy "2 phút" từ
  tài liệu; tuyệt đối không `Infinity`. Mượn bài học Discord: test cả đường **phục hồi thất bại ⇒
  kết nối mới hoàn toàn**, đừng chỉ test đường thành công. Test bắt buộc phủ **cả hai** kịch bản dễ
  lẫn: cùng-tab-rớt-rồi-về (không kick) **và** thiết-bị-thứ-hai-thật (vẫn kick, session cũ vẫn bị thu
  hồi ở DB) — [chi tiết](docs/instruction/B147-chua-bat-connectionstaterecovery.md)
- **B148.** Đây là code **chống lạm dụng**, không phải code tiện ích — không giữ được hành vi tương
  đương thì **đừng làm**, nợ này chưa gây thiệt hại nào quan sát được. Ngữ nghĩa có **hai** tầng,
  đừng gộp: chặn mềm trong cửa sổ (nuốt event + `RATE_LIMITED` **đúng 1 lần/cửa sổ** qua
  `warnedThisWindow`) và ngắt cứng theo `violationStreak` — tầng 2 là **theo cửa sổ thời gian rời
  rạc**, token bucket thuần không có khái niệm đó, phải viết ra định nghĩa tương đương trong summary
  thay vì để ngầm. Không có mốc cửa sổ thì `RATE_LIMITED` sẽ bắn mỗi event bị chặn — biến cảnh báo
  thành chính cái flood nó chống. `socket.onevent` đang bị ghi đè ở đây trong khi `socket.on` bị bọc
  ở chỗ khác (`RAW_PAYLOAD_EVENTS`) — hai lớp chồng nhau, hỏng `this` hoặc thứ tự gọi sẽ vỡ lớp kia.
  Không đổi `MAX_EVENTS_PER_SECOND` / `FLOOD_DISCONNECT_STREAK` (quyết định sản phẩm, phải hỏi).
  Không dựng được phép đo tải thật (`test-load.js`, §10) thì nói thẳng là lợi ích **định tính** —
  đừng bịa số — [chi tiết](docs/instruction/B148-setinterval-moi-socket-trong-flood-middleware.md)
- **B149.** **Không "sửa cho có".** Kịch bản (2 connection tới `gomoku.db`) không reachable trong
  kiến trúc hiện tại (`grep -rn "new Database(" server/` ra đúng 1 chỗ) — đừng thêm `busy_timeout`
  thấp hơn, retry logic, hay connection pool "để an toàn"; mỗi lớp phòng thủ thêm vào là một chỗ có
  thể sai mà không ai test được vì không dựng nổi kịch bản kích hoạt thật. **Không viết test** cho
  mục này — test cho một bug không reachable là test giả, pass mãi mãi mà không bảo vệ gì. Chỉ quay
  lại nếu một thay đổi khác trong tương lai thực sự thêm connection thứ hai — lúc đó đọc lại số đo
  trong `docs/todo/B149-*.md` trước, đừng đo lại từ đầu, và viết test đi kèm chính lúc thêm connection
  đó — [chi tiết](docs/instruction/B149-touchsession-block-5s-neu-co-connection-thu-hai.md)
- **B150.** **Hỏi trước khi làm: cái này có đáng làm không?** Không ai báo cáo triệu chứng — nó được
  tìm thấy khi điều tra #147. Một tính năng không ai thiếu là chi phí bảo trì thuần tuý. Ranh giới
  quan trọng nhất: `room:joined` phục vụ **cả** người quay lại **lẫn** người vào phòng lần đầu ⇒ nhét
  buffer chat vô điều kiện = cho người lạ đọc cuộc trò chuyện trước khi họ vào. Đó là quyết định
  quyền riêng tư/sản phẩm, **chốt với người dùng, đừng tự chọn** (công cụ phân biệt đã có sẵn: cờ
  `handshake.auth.reconnect` và nhánh `existingRoom`). **Đừng** nhét chat vào `serializeRoom()` —
  `room:updated` bắn rất thường xuyên và `serializeRoomUpdate` cố ý bỏ `settings` để tiết kiệm băng
  thông (đo được 163 B/2073 B, nhân theo bình phương số người); chat chỉ đi kèm `room:joined`. **Đừng**
  lưu chat xuống SQLite (không cần sống qua restart). Giới hạn N phải ép ở **chỗ ghi**, không phải chỗ
  đọc — mảng không giới hạn trong state của room là rò rỉ bộ nhớ. Kiểm bằng grep xem chat phòng giải
  đấu (`tournament-match`) có đi chung đường không, đừng giả định —
  [chi tiết](docs/instruction/B150-chat-mat-han-khi-nguoi-choi-rot-mang.md)
- **B151.** **Đừng nhầm với B104** — B104 là bàn cờ vô tình *tạo* focus cho chat, B151 là chat *giữ*
  focus không được gỡ; sửa cái này không tự sửa cái kia, verify cả hai. Gỡ focus bằng
  `pointerdown`/`touchstart` trên vùng bàn cờ (không dùng `click`, tới muộn ~300ms trên mobile — bài
  học từ B104), chỉ `blur()` khi `quickChatInput` đang là `document.activeElement`. Đừng để logic blur
  can thiệp vào luồng gửi tin (`sendChatFrom()` tự lo trim/xoá value). Phạm vi đúng theo báo cáo gốc là
  "bấm bàn cờ" — đừng tự mở rộng sang "bấm bất kỳ đâu ngoài quick-chat-bar" mà không hỏi lại. Hiện
  tượng "màn hình tự cuộn" là giả thuyết (trình duyệt giữ phần tử focus trong khung nhìn), chưa đo
  bằng thiết bị thật — nếu còn cuộn sau khi thêm blur, đào tiếp root cause thay vì coi đã xong. Không
  có test infra cho `client/js/`, nói rõ trong summary. Verify bắt buộc trên thiết bị/emulation có
  touch thật, không chỉ đọc code —
  [chi tiết](docs/instruction/B151-quick-chat-input-giu-focus-sau-khi-tap-board.md)
- **B152.** (✅ Đã làm 2026-08-24 — `fix/game-move-ack-timeout-resync` off `dev`; chi tiết thực thi ở `docs/fix-log/2026-08-24-todo-152-game-move-ack-retry-resync.md`. Lệch có chủ đích so với hướng dẫn dưới đây: branch off `dev` chứ không `main` vì mục tracking `#152` chỉ có trên `dev` — ngoại lệ tracking-docs-only-on-dev của skill `git-workflow`; và replay `movePayload` khi trùng `moveId` chỉ gửi cho socket gửi lại, không broadcast, vì broadcast lại sẽ cho đối thủ `moveCount` lùi và kích hoạt gap check giả. Phần còn thiếu của gap detection tách thành **#154**.) **Làm TRƯỚC #153** (xem lý do ở B153). Thêm **method mới** có ack+timeout vào
  `SocketClient`, **đừng sửa `emit()` hiện có** (nhiều call site). **Guard `typeof ack === 'function'`
  bắt buộc** — client cũ còn trong cache `?v=` vẫn gửi bare emit, không guard sẽ throw trong handler và
  hỏng ván của họ (lỗi ship được mà máy dev không bao giờ thấy). Idempotency **chốt `moveId` uuid do
  client sinh** (chuẩn ngành — Socket.IO docs/Stripe/Gambetta đều vậy), server giữ tập đã xử lý theo
  ván, dọn ở `handleGameEnd`; **retry phải gửi lại đúng `moveId` cũ**. ⚠️ **Hai hướng đã bác bỏ, đừng
  khôi phục**: (a) dedupe theo "nước đi cuối" — hỏng khi đối thủ đi chen vào giữa lúc gói gửi-lại về
  trễ; (b) option `retries` toàn cục của socket.io — đọc source 4.8.3 (`socket.js:252/359/360`,
  `_drainQueue :392-407`) thấy nó áp cho **mọi** emit + tự nhét ack + hàng đợi tuần tự gây
  **head-of-line blocking**; 1 socket dùng chung toàn trang (#145) ⇒ chat bị gửi 4 lần. Dùng
  `.timeout(5000).emit()` **per-emit** (`socket.js:735`/`:291`) + tự viết đúng 1 lần retry. Emit
  `game:moved` **trước**, `ack` **sau** (hai đường độc lập). `game:resync` phải **tái dùng** logic dựng
  state của `room:joined` (`SocketHandler.js:233-266`), đừng viết lại. **Retry CHỈ khi timeout, không
  bao giờ khi ack trả `{error}`**; máy trạng thái 6 bước ở `docs/todo/B152-*.md` mục 4 là bản chốt
  (ngân sách xấu nhất 10s = 2×5s rồi resync). **Gap detection `moveCount`** (mục 5) có bẫy **resync vô
  hạn** — `moveCount` bị set lại bởi cả `game:init`/`room:joined`/`game:swap2_state`/undo, nên gap check
  chỉ áp cho delta tuần tự của `game:moved`, mọi đường nạp-state-đầy-đủ phải **reset baseline**. Chuỗi
  UI mới bắt buộc vào **cả `vi` lẫn `en`** trong `i18n.js`, đừng hardcode tiếng Việt. **Đừng đụng** debounce
  `broadcastRoomUpdate` (đường phòng/sảnh, tách biệt hoàn toàn), **đừng siết `pingInterval`/`pingTimeout`**
  (cố ý ngoài phạm vi — rủi ro false disconnect trên chính mạng mất gói này, tiền lệ #131 chọn sai
  ngưỡng vì calibrate trên 1 mẫu), **đừng mở rộng ack sang event khác** (`room:sit`, `chat:message`…) —
  ghi TODO riêng nếu thấy. Timeout 5000ms là số khởi điểm, chỉnh thì phải dựa trên phân bố RTT đo được.
  Verify bắt buộc: Chromium thật, instance **cô lập**, và **mô phỏng mất gói** để test đường freeze —
  happy path không chứng minh được gì. `client/tests/` **đã có** test infra (`CLAUDE.md` ghi ngược lại
  là thông tin cũ). Bump `?v=N`. Branch off **`main`** (bug có trên cả 2 nhánh) (báo cáo người chơi TQ,
  TODO.md #152) — [chi tiết](docs/instruction/B152-game-move-khong-co-ack-timeout-retry-gay-freeze.md)
- **B153.** (✅ Đã làm 2026-08-24 — cùng branch `fix/game-move-ack-timeout-resync` off `dev`, commit
  riêng; chi tiết ở `docs/fix-log/2026-08-24-todo-153-optimistic-render.md`. Lệch có chủ đích so với
  hướng dẫn dưới đây: overlay hoà giải theo `game:moved` khớp toạ độ, **không phải** ack — ack `{ok}`
  không tự gỡ overlay (lý do: tránh flash-rỗng nếu chính broadcast của nước đó bị gap-check #152 chuyển
  hướng sang resync); thêm chặn "1 nước đang bay" ở `onCellClick` (không có trong bảng gốc, cần thiết vì
  `isMyTurn` phía `board.js` không tự tắt cho tới khi có xác nhận). Không ép được đo RTT mô phỏng cho
  phần xác nhận-từ-server bằng CDP (giới hạn Chromium: không throttle WebSocket đã mở) — đã nói thẳng
  theo tiền lệ #126, không báo khống số đo.) **⚠️ KHÔNG implement trước khi #152 xong** — optimistic thiếu ack biến freeze
  thành *âm thầm*: người chơi thấy quân hiện ra, tưởng đã đi, nhưng server chưa nhận; họ ngồi chờ đối
  thủ trong ván mà lượt vẫn thuộc về mình. Hồi quy thật, tệ hơn hiện trạng. **Đừng nhân bản logic
  `GameEngine` sang client** — chỉ kiểm tối thiểu (đúng lượt + ô trống + trong bàn + không phải tường),
  **tuyệt đối không** nhân bản `_checkWin`. **Loại trừ Swap2 opening**: `GameHandler.js:714-741` khởi
  tạo với `color: null`, màu chỉ resolve sau `swap2Choice` ⇒ client không biết vẽ quân đen hay trắng,
  giữ nguyên chờ-server, đừng "đoán" màu. **Xác minh luật portal trước khi code** — nếu portal relocate
  quân thì optimistic vẽ sai chỗ, phải tắt khi `rulePortal` bật; code hiện tại *gợi ý* `movePayload`
  giữ nguyên `x,y` nhưng **chưa kiểm chứng, đừng tin**. Quân pending phải **nhìn khác** quân xác nhận
  (bán trong suốt/nét đứt) — trung thực + rollback đỡ giật. Xử lý đủ **ba** đường kết thúc (ack ok /
  ack error / timeout), thiếu đường nào cũng để pending mắc kẹt. `game:moved` là broadcast cho cả phòng
  kể cả người vừa đi — **hoà giải, đừng lọc bỏ**. Đã trace xong: không có timer/CSS transition ẩn nào,
  đừng đi tìm. Verify phải có **network throttling ~500ms RTT** (localhost ~0ms sẽ khiến optimistic
  trông như không làm gì) và **đo lại độ trễ trước/sau**; không đo được thì nói thẳng (tiền lệ #126).
  Bump `?v=N` (gộp đợt với #152 thì bump **một lần**) (báo cáo người chơi TQ, TODO.md #153) —
  [chi tiết](docs/instruction/B153-optimistic-render-quan-co-cua-chinh-minh.md)
- **B154.** (✅ Đã làm 2026-08-26 — `fix/turn-watchdog-resync-deadlock` off `dev`; chi tiết ở
  `docs/fix-log/2026-08-26-todo-154-turn-watchdog-resync.md`. **Lệch có chủ đích so với hướng dẫn
  dưới đây**: chỗ này viết "cả hai phía dùng chung một ngưỡng N", nhưng hai phía khác bản chất — phía
  chờ đối thủ bị chặn bởi *thời gian nghĩ* (α × đồng hồ, đo được), phía vừa gửi bị chặn bởi *RTT*
  (2500ms, vì broadcast luôn được ghi vào socket trước ack); ép chung một N sẽ để quân pending kẹt cả
  một lượt đồng hồ. Vẫn chung `game:resync`, chung bộ huỷ, chung chỗ arm. Và: watchdog **chỉ arm khi
  tin rằng không phải lượt mình** — arm luôn sẽ resync mỗi lần tự nghĩ lâu.) Phần còn thiếu của gap detection #152. **Đọc `docs/fix-log/2026-08-24-todo-152-*.md`
  phần "Hạn chế đã phát hiện" trước** — đã xác minh xong rằng hệ thống hiện không có broadcast định kỳ
  nào để làm sự kiện đánh thức (`TimerManager` tick thuần server-side), **đừng điều tra lại**. **Đừng
  sửa gap detection hiện có** (nó đúng, có test, và bẫy resync-vô-hạn là thật) và **đừng dựng đường
  resync mới** — `game:resync` + `buildRoomStatePayload()` đã có. Nếu làm watchdog theo lượt: **đo
  ngưỡng trước, đừng chọn số tròn** (#131), và watchdog phải tự huỷ ở mọi đường đổi state (kết thúc
  ván, undo, Swap2, rời phòng) nếu không sẽ có resync mồ côi. Hạ tầng test đã có cả hai tầng, và
  `e2e/game-move-ack-resync.spec.ts` đã có sẵn cách mô phỏng mất gói (vá `Socket#packet`) — tái dùng.
  Đụng `client/` ⇒ bump `?v=N` (TODO.md #154) —
  [chi tiết](docs/instruction/B154-gap-detection-khong-pha-duoc-deadlock-2-nguoi.md)
- **B155.** (✅ Đã làm 2026-08-26 — `feature/full-csp-zero-latency` off `dev`, `?v=155`. **Lệch có
  chủ đích so với hướng dẫn dưới đây**: mục 2b nói snapshot lấy từ `gameState.timerValues` — field đó
  không tồn tại, đồng hồ thật nằm ở `RoomState.timerValues` (top-level, xem `room.js`); mục 4 so
  `gameState.currentTurn === myPlayer.color` — field đó giữ `userId`, không phải màu, nên pre-check
  thật so với `myUser.userId`. Cả hai đã sửa theo field thật, không theo văn bản gốc.) Nối tiếp #153 — nâng optimistic render thành Full CSP. Đọc
  `features/full-csp-zero-latency/planning.md` trước (thảo luận thiết kế đã resolved với người dùng).
  `board.js`: `_drawOptimisticStone` bỏ `globalAlpha 0.5` + viền nét đứt, vẽ solid như quân thật;
  giữ `warning` field nhưng chỉ hiện dấu hiệu rất nhẹ, đừng phá "indistinguishable". `game-ui.js`
  `sendMove`: phát `audioManager.playMoveSound(false)` ngay sau `setOptimisticStone`, trước
  `emitAck`. Thêm field **mới** `predictedTurn` sống cạnh `boardRenderer` trong `RoomState` — **tuyệt
  đối không gán `gameState.currentTurn`/`timerValues`**; `updateBoardState()`/`renderTimers()` đọc
  `predictedTurn.active` để render turn-bar/đồng hồ đối thủ, đếm ngược sống từ snapshot thật tại thời
  điểm click (`Date.now() - switchedAtLocalTs`). Rollback (ack lỗi, timeout-lần-2→resync,
  `game:ended` đua) = tắt cờ + gọi lại `updateBoardState()`, **không viết logic khôi phục riêng** —
  nếu thấy cần khôi phục nghĩa là đã lỡ ghi vào `gameState`, dừng lại tìm chỗ đó.
  `room-socket.js` `game:moved`: khử âm thanh nếu là nước mình + khớp `optimisticStone` (đối
  thủ/spectator không đổi); thứ tự bắt buộc — ghi `gameState` từ payload → gỡ `optimisticStone` →
  tắt `predictedTurn` → `updateBoardState()` (đảo bước 3 lên trước sẽ lộ 1 frame timer sai).
  `game:ended`: gỡ overlay + dừng timer **trước** khi áp kết quả. Local pre-check ở `onCellClick`:
  chỉ 3 điều (ô trống, đúng lượt, `status === 'ongoing'`) từ dữ liệu client **đã có sẵn** — **đừng**
  thêm check tường/portal (client không có dữ liệu hình học đó, không được nhân bản `GameEngine`).
  Test theo ma trận 13 case ở `planning.md` Q3 (không chỉ case xong — cả rollback/dedup/local-block/
  đối thủ-không-đổi/double-click), dùng lại stub có sẵn trong
  `client/tests/game-optimistic-render.test.js`. **Ngoài phạm vi cố ý**: không đụng
  `server/socket/SocketHandler.js`/transport config (`perMessageDeflate`, `TCP_NODELAY` — tối ưu
  mạng thật, không phải cảm nhận, và ảnh hưởng cả chat/room list nếu đổi toàn socket); không đổi
  `click` → `pointerdown` trong task này. Đụng `client/` ⇒ bump `?v=N` (đánh giá spec bên ngoài,
  TODO.md #155) — [chi tiết](docs/instruction/B155-full-csp-am-thanh-luot-di-tuc-thi-0ms.md)
- **B156.** Sửa ở `GameHandler.js:442` (nhánh `mode === 'opening'` trong `game:undo_accept`) — sau
  `buildSwap2State(...)`, gắn `undoCancelled: true` lên object trả về trước khi emit, tái dùng cờ
  client đã có sẵn ở `room-socket.js:355-358`. **Đừng sửa `buildSwap2State()` dùng chung** — hàm đó
  còn gọi ở move handler/swap2_choice handler cho mục đích khác. Không đụng nhánh `play` (đã đúng,
  đã emit `game:undo_applied`) hay `declineUndo` (đã đúng). Chỉ bump `?v=N` nếu cách làm cuối cùng có
  đụng file trong `client/js/` (TODO.md #156) —
  [chi tiết](docs/instruction/B156-swap2-opening-undo-accept-popup-khong-bien-mat.md)
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
- **B158.** Sửa `RoomManager.listRooms()` (`server/managers/RoomManager.js:614-638`), đổi
  `userCount: room.users.size` thành đếm có điều kiện theo `presence`. **Phải hỏi người dùng trước**
  giữa 2 công thức: (A) chỉ loại viewer (`slot === null`) đã `disconnected`, giữ nguyên player đang
  trong grace; hay (B) loại mọi user `disconnected` bất kể `slot`. Không đụng `room.users`/
  `userRoomMap`/logic reconnect (#115) — chỉ đổi công thức đếm hiển thị. Thêm test cho
  `server/tests/RoomManager.test.js` (đã có test `listRooms()`/`userCount` — kiểm tra file hiện tại
  trước để tránh trùng case) —
  [chi tiết](docs/instruction/B158-loi-phong-o-sanh-dem-ca-viewer-ma.md)
- **B159.** Chat riêng 1-1 ở Sảnh. Thứ tự: (1) đổi shape `getOnlineUsersList()` (`state.js:67`) →
  `[{userId, displayName, isGuest}]`, sửa `lobby.js` `renderOnlineLine()`, test mới
  `state-online-users.test.js` — **không** thêm delta cho `lobby:online_users` (cố tình full-state +
  debounce 1500ms, fix #41). (2) `server/socket/handlers/PrivateChatHandler.js` mới: `register` +
  `cleanupUser`, tái dùng `sanitize`/`profanityFilter` từ `managers/ChatHandler.js`, hằng số riêng
  `PRIVATE_CHAT_RATE_LIMIT=5`/`_WINDOW_MS=3000`, `messageId = crypto.randomUUID()` echo cả 2 phía,
  `activePeers` Map, emit **thẳng tới socket** (không `io.to`/`broadcast`/`io.emit`). Đăng ký ở
  `SocketHandler.js` (~286) + cleanup ở nhánh `disconnect` (~297). Thêm file vào `SERVER_FILES` của
  `error-codes-i18n-consistency.test.js`. (3) i18n `private_chat.*` + `err.*` vi/en, key phẳng có
  dấu chấm. (4) `private-chat.js` (ES module, thêm vào `index-entry.js`), `audio-manager.js`
  `playMessageSound()` (UMD, không thêm vào entry), markup + CSS trong `lobby-zen.css`. **Ô nhập 1
  dòng như phòng** (`client/room.html:151-154` + `room.js:319-323`), Enter gửi, không textarea. (5)
  bump `?v=N` toàn `client/`. Notification chỉ qua nút "Bật thông báo" — không xin quyền tự động.
  Không lưu DB. Không đánh dấu xong nếu chưa verify frontend trên browser thật —
  [chi tiết](docs/instruction/B159-private-chat-1-1-sanh.md)
- **B160.** Gỡ bỏ hoàn toàn Dark UI Mode (người dùng quyết định gỡ, không hoàn thiện). Xoá code
  chết theo thứ tự: (1) xoá `client/js/theme-preload.js` + 3 `<script>` ref trong `index.html`/
  `tournament.html`/`tournament-match.html`. (2) `settings-panel.js`: gỡ `getTheme`/`setTheme` +
  `themeRow` (dòng 54-61, 168-178), `group(appearance, [densityRow])` chỉ còn density. (3) `i18n.js`:
  xoá `gset.theme`/`_light`/`_dark` cả vi (453-455) và en (1083-1085). (4) `main.css`: `:root,
  [data-theme="light"]` → `:root`; xoá khối `[data-theme="dark"]` (139-187) + `.ui-shell` (487-489);
  **giữ token `--board-*`**. (5) `room.css`: xoá 4 rule `[data-theme="dark"]` (37-52). (6) `board.js`:
  gỡ `_themeObserver` (87-92), giữ `_readBoardTheme()`. (7) bỏ qua `localStorage['theme']` cũ (quyết
  định có ý thức). (8) bump `?v=N` toàn `client/` + grep verify. KHÔNG sửa `docs/todo/B70`/`B73`
  (append-only — chỉ ghi chú). KHÔNG đụng board-lock. Verify `npm test` + browser thật mọi trang
  (không FOUC, không console error, panel Cài đặt đúng) + `git grep` xác nhận sạch —
  [chi tiết](docs/instruction/B160-go-bo-dark-ui-mode.md)
- **B161.** Gộp Density Mode về Lite + Default, bỏ Pro. Sửa `ui-mode.js` trước (`MODES` còn 2 phần
  tử; `getUiMode` + `ui-mode-preload.js` map `'pro'`→`'default'` và ghi đè localStorage 1 lần —
  **điểm dễ sai nhất: không map thì Pro user tụt về Lite**). Chuyển hóa nhánh: `=== 'pro'` giữ
  thông tin có ích → `=== 'default'` (tag luật đầy đủ, replay auto-Analysis); `=== 'pro'` chỉ là
  noise → xóa (roomId meta phòng, `Infinity` tên online, nút "Use last settings"/`modal--pro`);
  `!== 'pro'` → `=== 'lite'`. Dọn: gộp 4 bản `uiMode()` cục bộ → `getUiMode`, xóa `applyReplayMode()`
  rỗng (kiểm HTML nút analysis có `display` hợp lệ trước), xóa `.online-panel--lite*` mồ côi
  `lobby.css:760-767`, segment `settings-panel.js` còn 2, xóa i18n `mode.pro*` vi/en. Lite giữ
  nguyên hành vi hiện tại. Bump `?v=N` toàn `client/` + grep verify 1 giá trị. KHÔNG đụng ui/*
  board-locks, KHÔNG đụng backend, KHÔNG sửa fix-log phase-2 (append-only). Client chưa có test tự
  động → verify browser thật (gồm test thủ công `gvn_ui_mode='pro'` → phải thành Default) —
  [chi tiết](docs/instruction/B161-gop-2-che-do-ui-lite-default-bo-pro.md)
- **B162.** CHỈ sửa CSS `.score-table` (`room.css` ~369–387): thêm `border-right` cho
  `th:not(:last-child)`/`td:not(:last-child)` — KHÔNG viền ngoài. `border-collapse: collapse` đang
  bật nên phải dùng `:not(:last-child)` để không tạo khung. Đối chiếu `room-zen.css:559+` (dùng
  token zen) + mobile `room.css:913`. Không đụng `renderScoreTable`/`room.html`. Bump `?v=N` toàn
  `client/` + grep verify 1 giá trị; verify browser thật (thường + zen + mobile) —
  [chi tiết](docs/instruction/B162-score-table-thieu-duong-ke-cot-kho-doc.md)
- **B163.** Viết lại `generateGuestName()` (`server/routes/auth.js:246`) → `'guest' +
  String(crypto.randomInt(0,10000)).padStart(4,'0')`. Giữ vòng `do…while` kiểm trùng với
  `displayName` khách đang online (tận dụng shape mới của `getOnlineUsersList()` từ B159), `LIMIT`
  nhỏ ~20, hết lượt vẫn trả candidate cuối; nếu không có tra cứu đồng bộ rẻ trong route thì ghi rõ
  best-effort trong summary, đừng dựng hạ tầng. Pitfall: hàm còn là fallback OAuth ở ~dòng 567 —
  mặc định dùng chung định dạng mới, hỏi trước nếu muốn tách. Grep `GUEST_NAME_ADJECTIVES`/
  `GUEST_NAME_NOUNS`; xoá khỏi `config.js` chỉ khi không còn nơi dùng. KHÔNG bump `?v=N`, KHÔNG đụng
  `isValidDisplayName`/đường register. Test Jest: regex `^guest\d{4}$`, nhánh padStart số < 1000 —
  [chi tiết](docs/instruction/B163-guest-name-guest-plus-4-digits.md)
- **B164.** `server/utils/logger.js`: thêm `LOG_FORMAT=pretty|logfmt|auto` (auto = pretty khi
  `stdout.isTTY`); đối số cuối là plain object → structured fields `k=v` (logfmt-quote space/`=`/`"`);
  giữ nguyên chữ ký `debug/info/warn/error` để không sửa ~91 call site. `server/utils/geo.js` (mới):
  CHỈ đọc header Cloudflare (`CF-IPCountry` + tuỳ chọn city/region/asn), KHÔNG thêm dependency
  GeoIP — dev không qua CF thì `geo=-`/`local`; đổi sang MaxMind sau chỉ cần sửa 1 module này.
  `server/middleware/accessLog.js` (mới): tắt mặc định, bật `LOG_HTTP=true`, mount sau
  `express.json()`. Wire `{ip,geo}` vào SocketHandler connect/disconnect + `middleware/auth.js` 4
  warn + `routes/auth.js` login/register/guest/google. KHÔNG bump `?v=N`. Pitfall: sửa
  `SocketHandler.test.js` case "reason không bị coerce" sang đọc fields bag. Test mới
  `geo.test.js` + `logger.test.js` — [chi tiết](docs/instruction/B164-server-log-logfmt-va-ip-geo.md)
- **B165.** ĐO `d` (one-way delay) thật trước khi chọn cách bù — nếu chỉ ~50ms thì cú nhảy 3s có
  nguồn khác, dừng lại điều tra. Bù transit delay **phía client**: đọc RTT từ `io.engine` ping/pong
  sẵn có (tránh dựng ping mới), trừ half-RTT khỏi `activeDeadline`/`remaining` trong
  `room-socket.js` `applyTimerSync`/`tickLocal`. Gọi `tickLocal()` ngay trước
  `snapshotTimerValues = Object.assign(...)` ở `game-ui.js` `sendMove`. Listener `visibilitychange`
  (dòng 62) + `window focus` → re-apply `lastSync`. **KHÔNG** đụng `TimerManager`/`getSync` (server
  đang đúng — sửa server là B167). **KHÔNG** map sang "client gửi timestamp" (bề mặt bảo mật — B167).
  Kiểm `armTurnWatchdog` không false-positive nếu trừ half-RTT khỏi `activeDeadline`. `tournament-match.js`
  có bản sao timer — chỉ phòng thường, ghi TODO riêng nếu muốn đồng bộ. Bump `?v=N` + grep verify.
  Test: mock `halfRttMs` lớn trong `game-optimistic-render.test.js` — [chi tiết](docs/instruction/B165-timer-nhay-do-transit-delay-predictedturn-desktop.md)
- **B166.** Tiên quyết: B165 xong + cơ chế bù trễ đã chốt — viết chi tiết hàm SAU đó, đừng đoán.
  Chỉ nhân bản cơ chế B165 xuống `renderStripPlayer` (`room-ui.js:236`) + `updateStripTimers()`
  (`room-ui.js:330`); `predictedTurn` render-only, không ghi `gameState`. Tách helper chung cho công
  thức giá trị đồng hồ để mobile/desktop không lệch nhau. Không đụng desktop turn-bar. Bump `?v=N` —
  [chi tiết](docs/instruction/B166-port-co-che-bu-tre-timer-sang-mobile-players-strip.md)
- **B167.** Task KHẢO SÁT — dừng và hỏi người dùng sau bước ĐO trước khi viết code. Đo
  `serverRecv − turnStart` (monotonic `process.hrtime`) vs `measuredHalfRTT` server-side trên
  production. Nếu B165 đã đủ → đóng "không cần". Nếu làm: clamp `refund` (test case đầu tiên:
  `clientTs = turnStart` → refund vẫn ≤ HARD_CAP), lag-budget/ván, đo lag server-side, `clientTs`
  chỉ cross-check. Điểm chèn: method mới trên `TimerManager`, không rải logic ra `GameHandler`.
  KHÔNG siết `pingInterval`/`pingTimeout` toàn cục (bẫy #147/#152). Cân nhắc bỏ refund cho `per_move`.
  Kênh lấy mẫu Bước 1 đã có thêm trang #168 (`/diag`) — đọc `server/data/diag-results/*.jsonl`; spec
  Bước 2 không đổi vì #168 (trang chỉ đo, `clientTs` vẫn chỉ cross-check) —
  [chi tiết](docs/instruction/B167-khao-sat-server-side-lag-compensation-move.md)
- **B168.** Không phải task khảo sát — open question đã chốt hết ở `features/diagnostic-latency-page/`.
  Theo đúng 8 bước tuần tự ở `docs/instruction/B168-*.md`, mỗi bước 1 commit. **Bước 1 (tách
  `timer-sync-core.js`) rủi ro nhất** — extraction phải == biểu thức cũ từng token, test conformance
  bắt buộc, verify đồng hồ phòng chơi không đổi hành vi trong trình duyệt thật. `/diag` không chạm
  auth middleware, `GameEngine`/`TimerManager` mỗi phiên 1 instance huỷ khi disconnect, không đăng
  ký `RoomManager`. Đếm rate-limit lúc vào Warmup không phải lúc gửi. Sanitize control char ở
  `name`/`feedback` trước `JSON.stringify`. Ngưỡng verdict lấy từ phân bố đã đo (#154) hoặc mẫu đầu,
  ghi rõ nguồn. KHÔNG siết `pingInterval` (probe là message type riêng). Cập nhật B167 docs ở bước
  7, không gộp task. Verify e2e instance cô lập —
  [chi tiết](docs/instruction/B168-trang-chan-doan-do-tre-nguoi-choi-tu-kiem-tra.md)
