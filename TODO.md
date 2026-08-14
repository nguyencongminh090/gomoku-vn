# TODO

Quy ước: file này tách làm 2 phần.

- **Phần A — Không sửa được bằng code.** Cần công cụ ngoài, quyết định triển khai
  thật, phần cứng/hạ tầng, hoặc kiểm chứng mà agent không tự làm được trong repo.
- **Phần B — Sửa được bằng code, đang chờ làm.** Việc thật sự có thể implement
  trong repo này, liệt kê theo báo cáo nguồn, kèm giải pháp + đánh giá hiệu quả/an
  toàn + trạng thái unit test (theo rule "Bug-fix workflow" trong `CLAUDE.md`).

Khi có báo cáo mới, mục nào không sửa được bằng code → thêm vào Phần A; mục nào
sửa được → thêm vào Phần B, dưới một heading nguồn riêng (giữ nguyên theo report).

**Model đề xuất** (đánh giá 2026-08-08, xem lý do đầy đủ trong hội thoại lưu ở
`docs/fix-log.md` cùng ngày nếu cần tra lại): mỗi mục còn mở dưới đây có gắn
`[Model: <tên>]`. Đây là gợi ý dựa trên bản chất việc — đo đạc thuần túy/không
cần quyết định → Haiku 4.5; implement có phạm vi rõ ràng theo đúng quy tắc repo
→ Sonnet 5; quyết định kiến trúc/bảo mật có đánh đổi thật hoặc chẩn đoán nguyên
nhân gốc nhiều vòng dễ tự nhiễu (xem rule "Root-cause diagnosis" trong
`CLAUDE.md`) → Opus 5. **Nhắc khi bắt đầu làm:** đọc lại gợi ý này lúc thật sự
bấm vào làm task, không lúc ghi việc — bản chất việc có thể đã đổi (vd. một
quyết định kiến trúc có thể đã thu hẹp phạm vi sau khi bàn thêm với người
dùng), và danh sách model khả dụng cũng có thể đã đổi theo thời gian.

---


## Phần A — Không sửa được bằng code

### Nguồn: `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)
- ✅ **#1.** TLS/HTTPS trước app (review 3.0) — Nghiêm trọng nếu đang chạy HTTP trần — [chi tiết](docs/todo/A01-tls-https-truoc-app-review-3-0-nghiem-trong-neu-dang-chay.md)
- **#2.** Xác nhận biến môi trường khi deploy thật `[Model: Haiku 4.5]` — [chi tiết](docs/todo/A02-xac-nhan-bien-moi-truong-khi-deploy-that.md)
- **#3.** `npm install` không chạy được trên Node 24 tại máy đánh giá `[Model: Sonnet 5]` — [chi tiết](docs/todo/A03-npm-install-khong-chay-duoc-tren-node-24-tai-may-danh-gia.md)
- **#4.** Kiểm chứng thật cho các mục "CHƯA ĐO ĐƯỢC" trong review `[Model: Sonnet 5]` — [chi tiết](docs/todo/A04-kiem-chung-that-cho-cac-muc-chua-do-duoc-trong-review.md)

### Nguồn: stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)
- **#6.** Quyết định kiến trúc khi cần scale quá 1 tiến trình `[Model: Opus 5]` — [chi tiết](docs/todo/A06-quyet-dinh-kien-truc-khi-can-scale-qua-1-tien-trinh.md)
- ✅ **#7.** Đo lại bằng harness đa tiến trình (hoặc máy thứ 2) — [chi tiết](docs/todo/A07-do-lai-bang-harness-da-tien-trinh-hoac-may-thu-2.md)
- **#8.** Chưa có cách quan sát heap/GC của server đang chạy `[Model: Sonnet 5]` — [chi tiết](docs/todo/A08-chua-co-cach-quan-sat-heap-gc-cua-server-dang-chay.md)

### Nguồn: security review toàn bộ codebase (2026-08-03, yêu cầu người dùng "Does my website safe?")
- **#9.** Audit an ninh toàn bộ server + client — không phải diff, không có PR đang mở `[Model: Opus 5]` — [chi tiết](docs/todo/A09-audit-an-ninh-toan-bo-server-client-khong-phai-diff-khong.md)

### Nguồn: kiểm chứng bản sửa (commit `3da53dd`, đo lại 2026-08-01)
- **#5.** Mục 3.8 "vòng đời mật khẩu" — cần nội dung đầy đủ `[Model: Haiku 4.5]` — [chi tiết](docs/todo/A05-muc-3-8-vong-doi-mat-khau-can-noi-dung-day-du.md)

### Nguồn: `gomoku-vn-review(1).md` vòng 3, mục 12.6 (kiểm chứng 2026-08-02)
- ✅ **#10.** Hành vi thật của `cloudflared` với `X-Forwarded-For` do client tự gửi — [chi tiết](docs/todo/A10-hanh-vi-that-cua-cloudflared-voi-x-forwarded-for-do-client.md)
- **#11.** Hành vi khi bật `permessage-deflate` `[Model: Sonnet 5]` — [chi tiết](docs/todo/A11-hanh-vi-khi-bat-permessage-deflate.md)

### Nguồn: audit an ninh network qua DevTools — báo cáo `network_security_audit.md` (Antigravity IDE, 2026-08-08)
- **#67.** Xác minh HSTS thực tế có tới trình duyệt qua Cloudflare Tunnel không (claim của audit gốc sai — Helmet đã bật HSTS mặc định, cần đo thật trên deploy) `[Model: Haiku 4.5]` — [chi tiết](docs/todo/A67-xac-minh-hsts-header-thuc-te-qua-cloudflare-tunnel.md)

## Phần B — Sửa được bằng code, đang chờ làm

### Nguồn: `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)

Đã đối chiếu `docs/fix-log.md` — các mục sau **chưa** xuất hiện trong fix-log,
còn phải làm. Thứ tự đề xuất: rẻ/an toàn trước, đụng nhiều điểm gọi/cả client
sau cùng.
- ✅ **#1.** Restart-hang: thêm nhánh `else` (review 5.1) — `SocketHandler.js:113-125`, — [chi tiết](docs/todo/B01-restart-hang-them-nhanh-else-review-5-1-sockethandler-js.md)
- ✅ **#2.** Chat sanitize → escape entity (review 3.5) — `ChatHandler.js:74`, đổi — [chi tiết](docs/todo/B02-chat-sanitize-escape-entity-review-3-5-chathandler-js-74-doi.md)
- ✅ **#3.** `escapeAttr` sửa đúng cách escape (review 3.7) — `lobby.js:474-476`, — [chi tiết](docs/todo/B03-escapeattr-sua-dung-cach-escape-review-3-7-lobby-js-474-476.md)
- ✅ **#4.** `SELECT *` lộ player_id + thiếu rate limit `GET /api/games` (review 6.4) — [chi tiết](docs/todo/B04-select-lo-player-id-thieu-rate-limit-get-api-games-review-6.md)
- ✅ **#5.** Idle-scan magic number → config (review 5.5) — `RoomManager.js:49-52`, — [chi tiết](docs/todo/B05-idle-scan-magic-number-config-review-5-5-roommanager-js-49.md)
- ✅ **#6.** Timing attack — dummy bcrypt compare (review 3.6) — `auth.js:135-143`, — [chi tiết](docs/todo/B06-timing-attack-dummy-bcrypt-compare-review-3-6-auth-js-135.md)
- ✅ **#7.** Room quota theo IP (review 3.2) — `RoomManager.createRoom()`, đếm số — [chi tiết](docs/todo/B07-room-quota-theo-ip-review-3-2-roommanager-createroom-dem-so.md)
- ✅ **#8.** Bỏ `settings` khỏi `room:updated` (review 4.2) — chỉ gửi `settings` — [chi tiết](docs/todo/B08-bo-settings-khoi-room-updated-review-4-2-chi-gui-settings.md)
- ✅ **#9.** `lobby:update` → delta thật (review 4.1/13, fix-log #12 mới debounce — [chi tiết](docs/todo/B09-lobby-update-delta-that-review-4-1-13-fix-log-12-moi.md)
- ✅ **#10.** `timer:tick` → gửi `deadline` 1 lần/lượt (review 4.3) — client tự — [chi tiết](docs/todo/B10-timer-tick-gui-deadline-1-lan-luot-review-4-3-client-tu.md)

### Nguồn: kiểm chứng bản sửa (commit `3da53dd`, đo lại 2026-08-01)

Không thuộc review gốc — phát hiện mới từ đợt kiểm chứng, nhưng sửa được bằng
code và nên ưu tiên cao vì rẻ.
- ✅ **#11.** Viết test cố định cho 6 fix hiện không có gì bảo vệ — [chi tiết](docs/todo/B11-viet-test-co-dinh-cho-6-fix-hien-khong-co-gi-bao-ve.md)
- ✅ **#12.** Thứ tự sai tiềm ẩn trong `cancelDisconnectGrace` — [chi tiết](docs/todo/B12-thu-tu-sai-tiem-an-trong-canceldisconnectgrace.md)

### Nguồn: kiểm chứng bằng browser thật (Playwright, 2026-08-02)

Phát hiện khi verify Phần B #1/#2/#3 trên Chromium. Không gộp vào các fix đó
(rule "scope discipline") — ghi riêng ở đây.
- ✅ **#13.** Chat hiển thị entity thô sau fix #2 — server escape `<`/`>` thành — [chi tiết](docs/todo/B13-chat-hien-thi-entity-tho-sau-fix-2-server-escape-thanh.md)
- ✅ **#14.** `reconnect_attempt`/`reconnect` listener ở `socket-client.js` không bao — [chi tiết](docs/todo/B14-reconnect-attempt-reconnect-listener-o-socket-client-js.md)
- ✅ **#15.** Chat hiển thị `&lt;`/`&gt;` thô thay vì `<`/`>` — [chi tiết](docs/todo/B15-chat-hien-thi-lt-gt-tho-thay-vi.md)

### Nguồn: phát hiện khi làm Phần B #4 (2026-08-02)
- ✅ **#16.** `GET /api/games` (route list) vẫn trả `black_player_id`/`white_player_id` — [chi tiết](docs/todo/B16-get-api-games-route-list-van-tra-black-player-id-white.md)
- ✅ **#17.** `resolveWinnerName` phụ thuộc `*_player_id` cho dữ liệu cũ — [chi tiết](docs/todo/B17-resolvewinnername-phu-thuoc-player-id-cho-du-lieu-cu.md)

### Nguồn: báo cáo người dùng khi test thủ công, tái hiện bằng Playwright (2026-08-02)
- ✅ **#18.** Tạo phòng bị từ chối do quota IP (mục 7) vẫn "flash" sang `room.html` — [chi tiết](docs/todo/B18-tao-phong-bi-tu-choi-do-quota-ip-muc-7-van-flash-sang-room.md)

### Nguồn: điều tra #18 vòng 2 trên `play3cr.dpdns.org` (2026-08-02)
- ✅ **#30.** `MAX_ROOMS_PER_IP` có thể đang là cap theo cả site, không phải theo — [chi tiết](docs/todo/B30-max-rooms-per-ip-co-the-dang-la-cap-theo-ca-site-khong-phai.md)

### Nguồn: stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)

Tất cả các mục dưới đây là **nghi vấn/rủi ro tiềm ẩn phát hiện khi đo tải, chưa
mục nào được xác nhận là bug đang mở**. Đợt đo chứng minh được điều ngược lại:
tới 2000 người chơi đồng thời (1000 ván) **không crash, không treo, không rò rỉ
bộ nhớ**, CPU ~12% một core, RSS ~200MB. Vì vậy **đừng "sửa" mục nào ở đây trước
khi tái hiện được vấn đề** — thứ tự đúng là đo/chẩn đoán trước, sửa sau.
- ✅ **#19.** `game:init` không tới trong 15s ở tải cao — chưa xác định được nguyên nhân — [chi tiết](docs/todo/B19-game-init-khong-toi-trong-15s-o-tai-cao-chua-xac-dinh-duoc.md)
- ✅ **#20.** p95/p99 độ trễ nước đi vọt lên dưới tải — [chi tiết](docs/todo/B20-p95-p99-do-tre-nuoc-di-vot-len-duoi-tai.md)
- ✅ **#21.** Số timer chạy song song tăng tuyến tính theo số phòng — [chi tiết](docs/todo/B21-so-timer-chay-song-song-tang-tuyen-tinh-theo-so-phong.md)
- ✅ **#22.** Chi phí fan-out của broadcast theo số người trong phòng — [chi tiết](docs/todo/B22-chi-phi-fan-out-cua-broadcast-theo-so-nguoi-trong-phong.md)
- ✅ **#23.** `better-sqlite3` đồng bộ + `bcrypt` chặn event loop — [chi tiết](docs/todo/B23-better-sqlite3-dong-bo-bcrypt-chan-event-loop.md)
- ✅ **#24.** Chưa kiểm flood protection có báo nhầm dưới tải cao hay không — [chi tiết](docs/todo/B24-chua-kiem-flood-protection-co-bao-nham-duoi-tai-cao-hay.md)
- ✅ **#25.** Đường từ chối ở cap thật chưa được test dưới burst — [chi tiết](docs/todo/B25-duong-tu-choi-o-cap-that-chua-duoc-test-duoi-burst.md)
- ✅ **#26.** Harness đo tải hiện chỉ là script tạm, chưa vào repo — [chi tiết](docs/todo/B26-harness-do-tai-hien-chi-la-script-tam-chua-vao-repo.md)

### Nguồn: truy nguyên trần kết nối (2026-08-02, xem `docs/stress-test-report.md` §10)
- ✅ **#27.** Hàng đợi accept TCP tràn — mất 12-14% kết nối ở burst lớn — [chi tiết](docs/todo/B27-hang-doi-accept-tcp-tran-mat-12-14-ket-noi-o-burst-lon.md)
- ✅ **#28.** Thứ tự transport `websocket` trước `polling` — đã đo, CỐ Ý CHƯA ÁP DỤNG — [chi tiết](docs/todo/B28-thu-tu-transport-websocket-truoc-polling-da-do-co-y-chua-ap.md)
- **#29.** Trần >6000 người vẫn chưa quy được nguyên nhân — sau khi sửa backlog, `[Model: Opus 5]` — [chi tiết](docs/todo/B29-tran-6000-nguoi-van-chua-quy-duoc-nguyen-nhan-sau-khi-sua.md)

### Nguồn: yêu cầu người dùng, dựa trên số liệu stress test (2026-08-03)
- ✅ **#31.** Nâng `MAX_ROOMS`/`MAX_USERS_PER_ROOM` — có dư địa kỹ thuật, người dùng — [chi tiết](docs/todo/B31-nang-max-rooms-max-users-per-room-co-du-dia-ky-thuat-nguoi.md)

### Nguồn: security review toàn bộ codebase (2026-08-03)
- ✅ **#32.** Giới hạn ký tự cho `displayName` — defense-in-depth, không phải lỗ hổng — [chi tiết](docs/todo/B32-gioi-han-ky-tu-cho-displayname-defense-in-depth-khong-phai.md)

### Nguồn: security review toàn bộ codebase — recheck (2026-08-03)

Đợt recheck sau mục 32: audit lại từ đầu (không tin kết luận cũ), tập trung
vào các đường ít bị soi hơn (thoả thuận hoà, cộng giờ). Cả 2 finding dưới đây
đã qua vòng lọc false-positive riêng (sub-task độc lập, đọc code trực tiếp,
confidence ≥ 8/10) trước khi đưa vào đây.
- ✅ **#33.** Chấp nhận/từ chối đề nghị hoà không kiểm tra tư cách người chơi — [chi tiết](docs/todo/B33-chap-nhan-tu-choi-de-nghi-hoa-khong-kiem-tra-tu-cach-nguoi.md)
- ✅ **#34.** Chấp nhận/từ chối yêu cầu cộng giờ không kiểm tra tư cách người chơi — [chi tiết](docs/todo/B34-chap-nhan-tu-choi-yeu-cau-cong-gio-khong-kiem-tra-tu-cach.md)

### Nguồn: báo cáo người dùng khi test thủ công (2026-08-03)
- ✅ **#35.** `#start-modal` và `#game-overlay` (thông báo Thắng/Thua/Đấu lại) chồng — [chi tiết](docs/todo/B35-start-modal-va-game-overlay-thong-bao-thang-thua-dau-lai.md)

### Nguồn: báo cáo người dùng — lỗi đếm giờ trong luồng Swap2 (2026-08-04)
- ✅ **#37.** Timer không chạy trong suốt giai đoạn khai cuộc Swap2, và chạy sai bên — [chi tiết](docs/todo/B37-timer-khong-chay-trong-suot-giai-doan-khai-cuoc-swap2-va.md)

### Nguồn: yêu cầu người dùng — redesign Start Modal & luồng ready/kết-thúc-ván (2026-08-04)
- ✅ **#36.** Redesign Start Modal + bỏ Game-End Modal, đổi cơ chế đếm-trượt cho — [chi tiết](docs/todo/B36-redesign-start-modal-bo-game-end-modal-doi-co-che-dem-truot.md)

### Nguồn: báo cáo người dùng — "Reconnect Logic is not very well" (2026-08-04)
- ✅ **#39.** Guest/spectator (và người chơi khi ván chưa `ongoing`) mất kết nối bị — [chi tiết](docs/todo/B39-guest-spectator-va-nguoi-choi-khi-van-chua-ongoing-mat-ket.md)
- ✅ **#40.** Dán link `room.html` không có `?id=` (và không phải vừa tạo/join từ — [chi tiết](docs/todo/B40-dan-link-room-html-khong-co-id-va-khong-phai-vua-tao-join-tu.md)

### Nguồn: `gomoku-vn-review(1).md` vòng 3, mục 12.5 (kiểm chứng 2026-08-02)
- ✅ **#41.** Debounce `lobby:online_users` (300ms) gần vô dụng ở nhịp reconnect — [chi tiết](docs/todo/B41-debounce-lobby-online-users-300ms-gan-vo-dung-o-nhip.md)
- ✅ **#42.** `cancelEmptyRoomGrace` không có test bảo vệ cho đúng kịch bản mutation — [chi tiết](docs/todo/B42-cancelemptyroomgrace-khong-co-test-bao-ve-cho-dung-kich-ban.md)
- ✅ **#43.** Grace 20s + hạn mức 3 phòng/IP khoá nhầm người dùng chung IP — [chi tiết](docs/todo/B43-grace-20s-han-muc-3-phong-ip-khoa-nham-nguoi-dung-chung-ip.md)

### Nguồn: `gomoku-vn-review(1).md` vòng 3, mục 12.6 — chuyển từ Phần A #10, xác nhận qua Cloudflare API (2026-08-04)
- ✅ **#44.** `getClientIp()` đọc `CF-Connecting-IP` thay vì suy luận qua — [chi tiết](docs/todo/B44-getclientip-doc-cf-connecting-ip-thay-vi-suy-luan-qua.md)

### Nguồn: báo cáo người dùng — "Text not fully English on English mode" (2026-08-04)
- ✅ **#45.** Text không dịch / hardcode tiếng Việt khi ở chế độ English — [chi tiết](docs/todo/B45-text-khong-dich-hardcode-tieng-viet-khi-o-che-do-english.md)

### Nguồn: phát hiện phụ khi làm #45 (2026-08-04)
- ✅ **#46.** `login.js` nút ẩn/hiện mật khẩu — fallback hardcode tiếng Việt vì thiếu khoá i18n — [chi tiết](docs/todo/B46-login-js-nut-an-hien-mat-khau-fallback-hardcode-tieng.md)
- ✅ **#47.** Thông báo mất-kết-nối/kết-nối-lại hiện trùng lặp (server chat:message + client tự dịch) — [chi tiết](docs/todo/B47-thong-bao-mat-ket-noi-ket-noi-lai-hien-trung-lap-server.md)

### Nguồn: yêu cầu người dùng — thảo luận + blueprint UI cho tính năng Tournament (2026-08-04)
- ✅ **#48.** Triển khai đầy đủ tính năng Tournament (Tables & Tournaments) từ mockup — [chi tiết](docs/todo/B48-trien-khai-tinh-nang-tournament-tu-mockup-tables-tournaments.md)

### Nguồn: báo cáo người dùng — bàn cờ trận đấu giải đấu quá nhỏ, kèm ảnh chụp màn hình (2026-08-06)
- ✅ **#49.** Bàn cờ trong trận đấu giải đấu (tournament match) quá nhỏ, thiếu nhất quán với phòng chơi thường — cả Mobile lẫn PC — [chi tiết](docs/todo/B49-ban-co-trong-tran-dau-giai-dau-qua-nho-thieu-nhat-quan.md)

### Nguồn: yêu cầu người dùng — thảo luận qua `features/tournament-match-series/` (2026-08-06)
- ✅ **#50.** Cho phép một cặp đấu (pairing) chơi nhiều ván (game series: số ván cố định hoặc race-to-margin) thay vì chỉ một ván — [chi tiết](docs/todo/B50-cho-phep-mot-cap-dau-choi-nhieu-van-thay-vi-mot-van.md)

### Nguồn: báo cáo người dùng — "đăng nhập thiết bị khác" đá nhầm dù chỉ mở 1 tab (2026-08-06)
- ✅ **#51.** Quy tắc bump `?v=N` trong CLAUDE.md bỏ sót cross-module import — `tournaments.js` load `lobby.js` 2 lần, mở 2 kết nối socket.io — [chi tiết](docs/todo/B51-cache-bust-quy-tac-bo-sot-cross-module-import.md)

### Nguồn: báo cáo người dùng kèm ảnh chụp thật — xác nhận #49/#50 hoạt động đúng nhưng UX tổng thể vẫn kém (2026-08-07)
- ✅ **#52.** Trang trận đấu giải đấu (`tournament-match.html`) UX kém dù bàn cờ đã to hơn — mất cân bằng bố cục, khoảng trắng chết lớn, cả PC lẫn Mobile — [chi tiết](docs/todo/B52-trang-tran-dau-giai-dau-ux-kem-du-bang-co-da-to-mat-can-bang.md)

### Nguồn: báo cáo người dùng — "Organizer cannot set race-to-margin or sub-game" (2026-08-07)
- ✅ **#53.** Modal "Tạo giải đấu" thiếu hẳn UI để chọn series mode (race-to-margin/số ván cố định) — backend đã hỗ trợ đầy đủ nhưng frontend chưa có input nào — [chi tiết](docs/todo/B53-modal-tao-giai-dau-thieu-ui-chon-series-mode.md)

### Nguồn: báo cáo người dùng — 2 vấn đề UX trận đấu/điều hướng giải đấu (2026-08-07)
- ✅ **#54.** "Quay lại danh sách giải đấu" từ trang chi tiết giải đấu luôn về tab "Bàn chơi" thay vì tab "Giải đấu" — [chi tiết](docs/todo/B54-quay-lai-tu-chi-tiet-giai-dau-ve-lobby-mat-tab-giai-dau.md)
- ✅ **#55.** Trận đấu giải đấu không áp dụng/đồng bộ click mode từ Cài đặt — khác hành vi với phòng chơi thường — [chi tiết](docs/todo/B55-tran-dau-giai-dau-khong-ap-dung-dong-bo-click-mode-tu-settings.md)

### Nguồn: phát hiện phụ khi làm #52 (2026-08-07)
- ✅ **#56.** Mobile: nội dung tab (Nước đi/Trò chuyện/Khán giả) co về ~0 chiều cao ở `tournament-match.html` (mục 1 đã sửa, mục 2 `tournament.html` còn mở) — [chi tiết](docs/todo/B56-tournament-match-mobile-tab-content-collapse-va-lobby-layout.md)

### Nguồn: yêu cầu người dùng, giữa lúc làm #52 full-refactor (2026-08-07)
- ✅ **#57.** Trận đấu giải đấu chỉ có Đầu hàng — thêm Cầu hoà (Draw) và Xin cộng giờ (Time Request) như phòng chơi thường — [chi tiết](docs/todo/B57-tournament-match-them-draw-offer-va-time-request-nhu-phong-thuong.md)

### Nguồn: báo cáo người dùng, ngay sau đợt full-refactor #52/#55/#56 (2026-08-07)
- ✅ **#58.** Trận đấu giải đấu không có kiểu bàn cờ "Đá" (Stone) — luôn hiện "Giấy" (Paper) — [chi tiết](docs/todo/B58-tournament-match-thieu-board-display-mode-stone.md)

### Nguồn: yêu cầu người dùng — thảo luận qua `features/tournament-cancel/` và `features/tournament-live-matches-browser/` (2026-08-07)
- ✅ **#59.** Organizer huỷ giải đấu bất cứ lúc nào — [chi tiết](docs/todo/B59-to-chuc-huy-giai-dau-bat-cu-luc-nao.md)
- ✅ **#60.** Khách (visitor) xem trận đấu giải đấu — qua "Live Matches Browser" mới (yêu cầu xem trận đã hoạt động sẵn, phần mới là bảng khám phá) — [chi tiết](docs/todo/B60-khach-xem-tran-dau-giai-dau-qua-live-matches-browser.md)

### Nguồn: review nhanh UI desktop theo yêu cầu người dùng (2026-08-07)
- ✅ **#61.** Trận đấu giải đấu (PC): khối `.match-clocks` nằm quá sát/thiếu khoảng cách dọc với dòng `#match-meta` phía trên — [chi tiết](docs/todo/B61-match-clocks-qua-sat-detail-header-meta-tournament-match-pc.md)

### Nguồn: yêu cầu người dùng — nhận xét luồng series (2026-08-08)
- ✅ **#62.** Check-in "Sẵn sàng" giữa các ván trong series bắt quay lại trang giải đấu — nên tái dùng Start Modal, giữ người chơi ở lại `tournament-match.html` — [chi tiết](docs/todo/B62-series-ready-checkin-tai-cho-trong-tournament-match-thay-vi-quay-lai-trang.md)

### Nguồn: báo cáo người dùng — "Final score in standing tables is wrong and not match" (2026-08-08)
- ✅ **#63.** Round Robin: bảng Standings tính 1 điểm/pairing thắng, không cộng dồn điểm thật của series (VD thắng 3.5-0.5 chỉ hiện 1-0) — đối chiếu luật Swiss/FIDE thật: **không phải bug**, đóng — [chi tiết](docs/todo/B63-standings-score-nen-cong-don-tung-van-thay-vi-1-diem-moi-pairing.md)
- ✅ **#64.** Round Robin: thay bảng Standings dạng danh sách bằng Cross Table (bảng chéo) hiện tỉ số thật từng cặp đấu — hiển thị, không đổi cách tính rank — [chi tiết](docs/todo/B64-round-robin-cross-table-thay-danh-sach-standings.md)

### Nguồn: security review Network trong Developer Tools (2026-08-08)
✅ **#65.** CSP + third-party script — bảo vệ JWT bearer đang ở `localStorage` — [chi tiết](docs/todo/B65-csp-va-third-party-script-bao-ve-jwt-localstorage.md)

### Nguồn: audit an ninh network qua DevTools — báo cáo `network_security_audit.md` (Antigravity IDE, 2026-08-08)
- ✅ **#66.** Thiếu `Cache-Control: no-store` trên response `/api/auth/*` — JWT có thể bị cache `[Model: Sonnet 5]` — [chi tiết](docs/todo/B66-cache-control-no-store-tren-response-api-auth.md)
- ✅ **#68.** Chuyển JWT từ `localStorage` sang phiên mờ phía server + `HttpOnly` cookie — kèm thu hồi phiên được (revocation) và kiểm `Origin` chống CSWSH `[Model: Opus 5]` — [chi tiết](docs/todo/B68-can-nhac-chuyen-jwt-tu-localstorage-sang-httponly-cookie.md)
- ✅ **#69.** Tự host Google Fonts + audio assets — giảm rò rỉ IP người dùng cho bên thứ ba `[Model: Sonnet 5]` — [chi tiết](docs/todo/B69-tu-host-google-fonts-va-audio-de-giam-ro-ri-ip-nguoi-dung.md)

### Nguồn: yêu cầu người dùng — audit style nút bấm toàn client (2026-08-08)
- ✅ **#70.** Style nút bấm (button) không nhất quán toàn `client/` — màu xanh lá cũ còn sót, `--c-danger` chưa định nghĩa, nút chat focus-mode khác bản thường, `.btn-kick`/`.draw-prompt` hardcode màu, rule `:active` cục bộ bị `!important` toàn cục đè `[Model: Sonnet 5]` — [chi tiết](docs/todo/B70-button-style-khong-nhat-quan-toan-client.md)

### Nguồn: phát hiện trong lúc verify #70 bằng browser thật (2026-08-08)
- ✅ **#71.** ~~Ô nhập chat ở focus-mode (`#chat-input-wrapper`) hoàn toàn không hiện ra được~~ — đã kiểm tra lại bằng browser thật (2026-08-09): không tái hiện, đóng "không phải bug" (đã có JS re-parent sẵn từ Initial commit) `[Model: Sonnet 5]` — [chi tiết](docs/todo/B71-chat-input-focus-mode-khong-hien-do-display-none-to-tien.md)

### Nguồn: báo cáo người dùng — "User cannot change Display (Paper/Stone) It auto get back." (2026-08-08)
- ✅ **#72.** Toàn bộ tab Cài đặt trong phòng (Paper/Stone + board size + luật thắng + Wall/Portal + Swap2 + timer) không lưu được — 18 chỗ `onchange="fn()"` inline bị CSP `scriptSrcAttr:'none'` (TODO.md #65) chặn câm lặng, radio bật lại giá trị cũ ở lần re-render kế tiếp `[Model: Sonnet 5]` — [chi tiết](docs/todo/B72-room-settings-tab-onchange-blocked-boi-csp.md)

### Nguồn: báo cáo người dùng — "User in Tournament room cannot set Display (Paper/Stone) and no sound" (2026-08-08)
- ✅ **#74.** `tournament-match.html` không có tab "Cài đặt"/UI nào để đổi Display (Paper/Stone) giữa trận (cố ý từ B50, comment xác nhận), và hoàn toàn không có âm thanh — thiếu cả `<script audio-manager.js>` lẫn lời gọi `playMoveSound`/`playWinSound`/... mà `room-socket.js` có cho phòng thường `[Model: Sonnet 5]` — [chi tiết](docs/todo/B74-tournament-match-thieu-am-thanh-va-doi-display-mode.md)

### Nguồn: báo cáo người dùng kèm ảnh chụp — nút bấm trang giải đấu trông như mặc định trình duyệt (2026-08-08)
- ✅ **#73.** `.btn`/`.btn-confirm` không có rule base (unscoped) nào áp dụng được ngoài `.modal__actions` — nút "Bắt đầu"/"Xem cặp đấu"/"Báo giờ"/"Sẵn sàng" trên trang giải đấu render bằng UA stylesheet mặc định của trình duyệt; phát hiện ngoài phạm vi #70 vì verify của #70 không chụp trang giải đấu `[Model: Sonnet 5]` — [chi tiết](docs/todo/B73-nut-btn-btn-confirm-khong-co-base-style-ngoai-modal.md)

### Nguồn: báo cáo người dùng kèm ảnh chụp Cross Table thật (2026-08-08)
- ✅ **#75.** Cross Table (Round Robin, #64) chưa sắp theo hạng + chưa highlight Vô địch/Á quân khi giải kết thúc `[Model: Sonnet 5]` — [chi tiết](docs/todo/B75-cross-table-sap-xep-theo-hang-va-highlight-champion.md)

### Nguồn: báo cáo người dùng — luồng Sẵn sàng → Vào trận gây sai lệch thời gian giữa 2 người chơi (2026-08-08)
- ✅ **#76.** Đồng hồ trận đấu start server-side ngay khi cả 2 "Sẵn sàng", nhưng client bắt bấm thêm nút "Vào trận" thủ công — ai bấm sau bị trừ giờ oan; nên tự động vào trận khi cả 2 đã sẵn sàng `[Model: Sonnet 5]` — [chi tiết](docs/todo/B76-ready-auto-vao-tran-thay-vi-doi-bam-nut-enter.md)

### Nguồn: người dùng hỏi "Nó có lưu database ko" (2026-08-08)
- ✅ **#77.** Tournament đã ghi SQLite ở mọi transition nhưng `TournamentManager` chưa từng đọc lại — restart server xoá sạch mọi giải đấu khỏi bộ nhớ dù dữ liệu vẫn còn trong `gomoku.db`; thêm `loadTournamentsFromDb()` reload đầy đủ `[Model: Sonnet 5]` — [chi tiết](docs/todo/B77-tournament-du-lieu-song-sot-qua-restart-server.md)

### Nguồn: yêu cầu người dùng trực tiếp (2026-08-08)
- ✅ **#78.** Ván đấu tournament chưa từng lưu move history đầy đủ — `pairing.moves` bị ghi đè mỗi ván mới trong 1 series, không có replay UI nào; thêm bảng `tournament_games` (1 hàng/ván, tách khỏi `games` thường) + tab "Lịch sử ván đấu" + tái dùng replay viewer có sẵn `[Model: Sonnet 5]` — [chi tiết](docs/todo/B78-tournament-games-history-luu-tung-van-dau-rieng.md)

### Nguồn: báo cáo người dùng — "Time sometimes run on wrong sides" (2026-08-09)
- ✅ **#79.** Đồng hồ trận đấu giải đấu đôi khi hiện sai bên — `renderHeader()` gán panel `clock-black-name`/`clock-white-name` theo vị trí mảng `players[0]`/`[1]` cố định, trong khi màu quân thực tế đổi theo Swap2 choice (trong 1 ván) hoặc theo xoay seat mỗi ván trong series (từ ván 2 trở đi) — không phải bug reconnect `[Model: Sonnet 5]` — [chi tiết](docs/todo/B79-tournament-match-timer-hien-sai-ben.md)

### Nguồn: báo cáo người dùng — "no time alert for 10s left in tournament room" (2026-08-09)
- ✅ **#80.** Đồng hồ trận đấu giải đấu thiếu hiệu ứng nhấp nháy khi còn ≤10s — đổi màu đỏ + beep đã có sẵn từ #74, nhưng thiếu animation `timer-pulse` mà phòng thường có, khiến cảnh báo "nhẹ" hơn hẳn và dễ bị bỏ lỡ `[Model: Sonnet 5]` — [chi tiết](docs/todo/B80-tournament-match-thieu-hieu-ung-nhap-nhay-canh-bao-het-gio.md)

### Nguồn: báo cáo người dùng — "moving in tournament (navigate, comein/out...) sometimes slow" (2026-08-09), điều tra qua [docs/tournament-navigation-latency-report.md](docs/tournament-navigation-latency-report.md)
- ✅ **#81.** Vào trận giải đấu (`goToMatch`) dùng full page reload — mỗi lần đóng/mở socket lại trả giá 1 lượt session-lookup SQLite đồng bộ (blocking event loop) ở handshake; đã đo ở quy mô thực tế (bench-session-lookup.js mở rộng): p50/p99 chỉ đơn vị-chục µs, **không phải bottleneck**, đóng — không sửa `[Model: Sonnet 5]` — [chi tiết](docs/todo/B81-tournament-navigate-full-page-reload-session-lookup-blocking.md)
- ✅ **#82.** Đăng ký/hủy đăng ký giải đấu ở client bắn thêm 1 round-trip `tournament:get` thừa — server đã tự broadcast `tournament:updated` đầy đủ dữ liệu, round-trip thêm chỉ cộng dồn độ trễ mạng `[Model: Sonnet 5]` — [chi tiết](docs/todo/B82-tournament-register-thua-round-trip-tournament-get.md)
- ✅ **#83.** Broadcast khi đăng ký/hủy đăng ký không debounce (khác `_queuePairingChanged` đã có cho pairing) — mỗi thao tác bắn 2 broadcast toàn phòng + diff `JSON.stringify` từng entry, cộng dồn khi nhiều người join/leave gần đồng thời `[Model: Sonnet 5]` — [chi tiết](docs/todo/B83-tournament-register-broadcast-khong-debounce.md)
- ✅ **#84.** Tab "Lịch sử ván đấu" giải đấu: `getTournamentGames()` không `LIMIT`/phân trang, client render toàn bộ bảng bằng `innerHTML` đồng bộ — giật UI khi chuyển tab với giải đấu nhiều ván `[Model: Sonnet 5]` — [chi tiết](docs/todo/B84-tournament-games-history-khong-phan-trang.md)
- ✅ **#85.** `savePairing()` ghi SQLite đồng bộ mỗi lần pairing đổi trạng thái, `JSON.stringify` lại toàn bộ `games`/`moves` mỗi lần — **đã đo (2026-08-09), không phải bottleneck** (dưới 0.3ms kể cả worst-case 20×20/99 ván), đóng không sửa `[Model: Sonnet 5]` — [chi tiết](docs/todo/B85-save-pairing-ghi-dong-bo-json-blob-tang-dan.md)

### Nguồn: báo cáo người dùng — "user click on board but delay for 1s (low latency) it sometimes happen, but after refresh, it work fast again" (2026-08-09)
- ✅ **#86.** Trận đấu giải đấu: click bàn cờ thỉnh thoảng trễ ~1s trước khi quân xuất hiện, refresh trang thì lại nhanh — đã loại trừ trùng lặp listener canvas, rò rỉ listener banner/prompt, ghi DB đồng bộ trên đường đi 1 nước cờ, và tải server (p99 5.35ms, 0 nước ≥300ms — [báo cáo](docs/tournament-20-player-latency-test-report.md)); **đã thêm instrumentation client-side** (delta click→ack, transport, tab visibility) nhưng **không tái hiện lại được** — đóng theo đúng nhánh dự phòng của instruction.md, giữ instrumentation lại vĩnh viễn (chi phí thấp, là công cụ duy nhất bắt được lần tái phát tiếp theo) `[Model: Sonnet 5]` — [chi tiết](docs/todo/B86-tournament-match-board-click-doi-khi-tre-1s-refresh-het.md)

### Nguồn: yêu cầu người dùng — "Check Broadcast, throtte in Tournament. Make sure it smooth" (2026-08-09)
- ✅ **#87.** `broadcastLiveMatchesUpdate` (Live Matches Browser, #60) là broadcast tournament duy nhất không debounce/diff — mỗi lần gọi tính lại toàn bộ `tournamentGameMap` rồi emit lại nguyên danh sách; huỷ 1 giải đấu có N ván đang live bắn N lần tính toán + N emit toàn phòng liên tiếp (qua vòng lặp `forceCancelMatch` mỗi pairing) thay vì gộp 1 lần — các broadcast tournament khác (list, detail, pairings) đều đã debounce/diff `[Model: Sonnet 5]` — [chi tiết](docs/todo/B87-live-matches-broadcast-khong-throttle-diff.md)

### Nguồn: báo cáo người dùng — "Guest/audience View Tournament room cannot escape. Backend lock Player (who playing) but also lock viewers escape." (2026-08-09)
- ✅ **#88.** Khán giả/guest xem trận giải đấu bị khoá nút "Quay lại chi tiết giải đấu" y hệt 2 người chơi thật — `setLeaveLocked(true)` (`client/js/tournament-match.js`, 3 nơi gọi) không kiểm tra `myPlayer()`, khoá đồng loạt mọi socket trong room bất kể vai trò, dù mục đích gốc chỉ nhằm chống người CHƠI rời giữa series `[Model: Sonnet 5]` — [chi tiết](docs/todo/B88-tournament-match-khan-gia-bi-khoa-nut-quay-lai.md)

### Nguồn: phát hiện phụ khi cài `jest-environment-jsdom` cho #88's unit test (2026-08-09)
- ✅ **#89.** `npm audit` báo 3 lỗ hổng high-severity ở dependency gián tiếp, có từ trước (không phải do gói mới thêm): `js-yaml` (qua `jest`), `nanoid` (qua `vite`, cả 2 chỉ devDependency, rủi ro thấp), và `socket.io-parser` (qua `socket.io` — dependency PRODUCTION thật, DoS "memory exhaustion", đáng ưu tiên hơn 2 cái kia) `[Model: Sonnet 5]` — [chi tiết](docs/todo/B89-npm-audit-3-high-severity-transitive.md)

### Nguồn: báo cáo người dùng — "sometime website auto scroll on board click (make move)" trên Tournament Room (2026-08-09)
- ✅ **#90.** `tournament-match.js`'s `updateBoardState()` gọi `boardRenderer.resize()` sau MỌI nước đi (qua `requestAnimationFrame`), khác `game-ui.js` (Tables Room) không làm vậy — resize canvas lặp lại mỗi click gây reflow, kết hợp `overflow-anchor` mặc định của trình duyệt (không nơi nào tắt) khớp với hiện tượng scroll bất định sau click; chưa sửa, chỉ mới phân tích theo yêu cầu người dùng `[Model: Sonnet 5]` — [chi tiết](docs/todo/B90-tournament-match-tu-dong-scroll-khi-click-ban-co.md)

### Nguồn: yêu cầu người dùng — "Cách để thêm OAuth? ... write to TODO, You will do it" (2026-08-09)
- ✅ **#91.** Thêm đăng nhập bằng Google (OAuth 2.0) — route mới `GET /api/auth/google`/`/callback`, cột `oauth_provider`/`oauth_id` trên `users`, tái dùng nguyên session cookie mechanism sẵn có; ban đầu dùng 1 `GOOGLE_CALLBACK_URL` cố định nên vỡ khi dùng qua nhiều origin cùng lúc (`localhost:3000` + tunnel `play3cr.dpdns.org`) — sửa bằng cách tính callback URL động theo `Host` của từng request, bỏ hẳn biến env cố định; đã xác minh thủ công thành công qua `localhost:3000`, unit test 994/994 pass (2 test mới cho hành vi đa-origin) — **xác minh qua `play3cr.dpdns.org` với bản sửa mới CHƯA làm lại** (cần người dùng tự khởi động lại server rồi thử lần nữa) `[Model: Sonnet 5]` — [chi tiết](docs/todo/B91-google-oauth-login.md)

### Nguồn: báo cáo người dùng khi xác minh thủ công OAuth (nhánh `feature/oauth-login`, chưa merge) qua Cloudflare Tunnel — "Too many requests... It just affect same IP? My phone cannot log out" (2026-08-09)
- ✅ **#92.** `authLimiter` (`server/routes/auth.js`) dùng `req.ip` mặc định của `express-rate-limit` — đằng sau Cloudflare Tunnel mọi client thật đều gộp thành 1 "IP" quan sát được (peer TCP luôn là loopback), chia sẻ chung đúng 1 ngân sách 20 request/15 phút thay vì mỗi người 1 ngân sách; thêm `server/utils/get-client-ip.js` tái dùng logic CF-Connecting-IP đã có ở #44, gắn `keyGenerator` vào `authLimiter` `[Model: Sonnet 5]` — [chi tiết](docs/todo/B92-auth-rate-limit-shared-ip-behind-tunnel.md)
- **#93.** `gamesLimiter`/`tournamentGamesLimiter` có đúng lỗi IP-gộp y hệt #92 (cùng thiếu `keyGenerator`) — chưa sửa, mức độ thấp hơn nhiều (ngưỡng 300 req/15 phút so với 20 của auth), không có báo cáo người dùng cụ thể `[Model: Sonnet 5]` — [chi tiết](docs/todo/B93-games-tournamentgames-rate-limit-same-ip-bug.md)

### Nguồn: yêu cầu người dùng — "Review Database Design for OAuth. Review Security with OAuth." (2026-08-09)
- ✅ **#94.** `users.oauth_provider`/`oauth_id` (#91) chỉ có index thường (`idx_users_oauth`), không `UNIQUE` — kết hợp 1 khoảng hở TOCTOU thật ở `GET /google/callback` (có `await bcrypt.hash()` xen giữa lúc kiểm tra `getUserByOAuthId()` và lúc `createUser()`), 2 request gần-đồng-thời cho cùng 1 tài khoản Google MỚI có thể tạo ra 2 dòng `users` khác `id` nhưng cùng `(oauth_provider, oauth_id)` — lần đăng nhập sau đó có thể "rơi" vào 1 trong 2 dòng tuỳ SQLite trả về, gây nhầm lẫn định danh (không phải account-takeover); đã sửa: `idx_users_oauth` nâng `UNIQUE` (migration tự dò trùng trước, không tự xoá dữ liệu thật), `GET /google/callback` bắt riêng lỗi constraint rồi đọc lại dòng bên thắng thay vì `oauth_failed`; test SQLite thật (không mock DB) + test route — unit test 1015/1015 pass `[Model: Sonnet 5]` — [chi tiết](docs/todo/B94-oauth-duplicate-account-race-missing-unique-constraint.md)

### Nguồn: `/code-review` (8 agent song song) trên nhánh `feature/oauth-login` trước khi merge vào `dev` — yêu cầu người dùng "Review OAuth feature safe to merge to dev" (2026-08-10)
- ✅ **#95.** Cookie `gvn_oauth_state` bị đè khi có 2 lần thử đăng nhập Google gần-đồng-thời (2 tab, hoặc bấm lại nhanh) — lần thử đầu bị báo lỗi `oauth_state` giả dù hợp lệ, không phải lỗi bảo mật `[Model: Sonnet 5]` — [chi tiết](docs/todo/B95-oauth-state-cookie-collision-concurrent-attempts.md)
- ✅ **#96.** `GET /google/callback` không idempotent khi request bị lặp lại (network retry/replay) — `code` đã dùng bị Google từ chối lần 2, có thể hiển thị "thất bại" dù đã có phiên hợp lệ từ lần đầu `[Model: Sonnet 5]` — [chi tiết](docs/todo/B96-oauth-callback-not-idempotent-duplicate-request.md)
- ✅ **#97.** Tên hiển thị Google chứa `<>&"'` (vd. `O'Brien`) bị `isValidDisplayName()` từ chối rồi âm thầm thay bằng tên khách ngẫu nhiên, không có thông báo — ấn tượng đầu xấu cho tài khoản thật `[Model: Sonnet 5]` — [chi tiết](docs/todo/B97-oauth-display-name-punctuation-silently-discarded.md)
- ✅ **#98.** `GET /google` (JSON) và `GET /google/callback` (text thuần) xử lý lỗi "OAuth chưa cấu hình" khác nhau, cả 2 đều thoát khỏi UI lỗi đăng nhập có style mà mọi lỗi OAuth khác dùng — chỉ lộ khi deploy thiếu env var `[Model: Sonnet 5]` — [chi tiết](docs/todo/B98-oauth-not-configured-error-inconsistent-ui.md)
- ✅ **#99.** `login.js`'s `checkExistingSession()` redirect chạy trước khi kịp hiện banner lỗi OAuth — người dùng đã đăng nhập thử Google lần 2 bị lỗi sẽ không thấy được thông báo vì sao `[Model: Sonnet 5]` — [chi tiết](docs/todo/B99-login-js-existing-session-hides-oauth-error-banner.md)
- ✅ **#100.** Migration `idx_users_oauth` (#94) chạy lại toàn bộ dò-trùng + `DROP`/`CREATE INDEX` mỗi lần server khởi động thay vì gate như 4 migration khác trong cùng file — tốn tài nguyên vô ích khi đã ở trạng thái ổn định `[Model: Haiku 4.5]` — [chi tiết](docs/todo/B100-oauth-index-migration-reruns-every-boot.md)
- ✅ **#101.** Cookie `gvn_oauth_state` tự viết tay `httpOnly`/`sameSite`/`secure`/`path` thay vì tái dùng `baseCookieOptions()` của `session-cookie.js`; `clearCookie` cũng thiếu vài thuộc tính `clearSessionCookie()` luôn truyền đủ — rủi ro drift nếu chính sách cookie đổi sau này `[Model: Sonnet 5]` — [chi tiết](docs/todo/B101-oauth-state-cookie-duplicates-session-cookie-helper.md)
- ✅ **#102.** `login.js`'s `onAuthSuccess()` và `oauth-complete.js` viết lại gần y hệt logic "lưu user + chuyển hướng lobby"; kèm 2 điểm kém hiệu quả nhỏ (SELECT thừa sau INSERT khi tạo user Google mới, thêm 1 vòng round-trip trang qua `oauth-complete.html`) `[Model: Haiku 4.5]` — [chi tiết](docs/todo/B102-oauth-client-duplication-and-minor-inefficiency.md)

### Nguồn: yêu cầu người dùng — luật WALL mới cho nước thứ 2 (2026-08-11)
- ✅ **#103.** Luật WALL: nước thứ 2 của người chơi 1 phải đặt cách nước thứ 1 của họ khoảng cách **Chebyshev ≥ 4** (đã làm rõ: dùng Chebyshev = max(|dx|, |dy|), không phải Manhattan; ngưỡng xác nhận là ≥ 4) `[Model: Sonnet 5]` — [chi tiết](docs/todo/B103-wall-rule-nuoc-thu-2-manhattan-khoang-cach-4.md)

### Nguồn: báo cáo người dùng — mobile: chạm bảng cờ làm chatbox active & trang tự cuộn (2026-08-11)
- ✅ **#104.** `board.js`'s `_onTouchEnd` gọi `e.preventDefault()` SAU guard sớm-thoát (`!interactive || !isMyTurn || !onCellClick`) nên khi KHÔNG phải lượt người chơi (lượt đối thủ, trước ván, khán giả) `preventDefault()` không chạy — trình duyệt phát sinh synthetic `click` ~300ms sau `touchend` (có thể focus nhầm `#chat-input`) và có thể cuộn trang nếu ngón tay hơi di chuyển; kèm `.board-canvas-wrap canvas` (room) thiếu `touch-action: none` mà `#match-canvas` (tournament) đã có, khiến trình duyệt có thể bắt đầu cuộn trước khi JS kịp chạy dù `preventDefault()` có gọi `[Model: Sonnet 5]` — [chi tiết](docs/todo/B104-mobile-chatbox-active-va-scroll-khi-tap-board.md)

### Nguồn: báo cáo người dùng — "site loading sometime lag and slow" (kiểm payload + đo thời gian tải, 2026-08-12)
- ✅ **#105.** `server/index.js` không có compression middleware và `compression` cũng không có trong `package.json` — mọi asset text gửi nguyên si từ origin (đo được: gzip -9 giảm 63-87%, vd. `phosphor/bold/style.css` 85 761 → 11 960 B, `i18n.js` 73 467 → 18 063 B); **lưu ý Cloudflare đã tự nén Brotli cho người dùng cuối** (`content-encoding: br` đo trên domain thật) nên đây KHÔNG phải nguyên nhân triệu chứng người dùng báo, chỉ lợi ở chặng origin→CF và ở dev/test; **ĐO LẠI 2026-08-12 sau #106/#107/#108: VẪN ĐÁNG LÀM, giữ nguyên ưu tiên** — 327 486 B text/trang sảnh vẫn gửi không nén, gzip -9 còn 79 018 B (−76%, tiết kiệm 248 KB mỗi lần CF miss), và đây là băng thông upload nhà qua tunnel, đúng chỗ nghẽn gây đỉnh TTFB ~1s ; **ĐÃ LÀM 2026-08-12** (`fix/compression-middleware`): đo trên server thật, trang sảnh 570 164 → **290 728 B trên dây (−49,0%)**, woff2 không bị nén lại, #66/#106 nguyên vẹn, 14 test mới, `npm test` 1101/1101 `[Model: Opus 5]` — [chi tiết](docs/todo/B105-khong-co-compression-middleware.md)
- ✅ **#106.** `express.static(clientPath)` gọi không option nên mặc định `Cache-Control: public, max-age=0` — ép trình duyệt VÀ Cloudflare revalidate về origin cho từng asset mỗi lần tải trang, mâu thuẫn trực tiếp với cơ chế `?v=N` sẵn có (repo trả giá bump thủ công nhưng không hưởng lợi ích); đo được `cf-cache-status: REVALIDATED` (không bao giờ `HIT`) và TTFB `index.html` trung vị 0.30s nhưng 2/10 lần vọt 0.88-1.03s — với 26 request/trang sảnh, đây khớp đúng triệu chứng "thỉnh thoảng chậm"; **nghi là nguyên nhân CHÍNH, ưu tiên cao nhất nhóm này** `[Model: Opus 5]` — [chi tiết](docs/todo/B106-cache-control-max-age-0-ep-revalidate-moi-request.md)
- ✅ **#107.** Cả 4 trang (`index`/`room`/`tournament`/`tournament-match`.html) nạp `/socket.io/socket.io.js` — bản debug chưa minify 155 836 B — thay vì `/socket.io/socket.io.min.js` (46 822 B) mà server socket.io đã sẵn sàng phục vụ; đây là file LỚN NHẤT trên đường tới hạn trang sảnh, sửa 4 chuỗi ký tự tiết kiệm 109 KB/trang `[Model: Opus 5]` — [chi tiết](docs/todo/B107-socket-io-ban-debug-khong-minify.md)
- ✅ **#108.** ((a)+(c) đã làm 2026-08-12; **(b) người dùng chốt đóng, không làm** — tên icon ghép động trong JS nên không kiểm chứng an toàn 100% bằng grep tĩnh) Font icon Phosphor quá nặng, 3 vấn đề chồng nhau: (a) weight `bold` (85 761 B CSS + 150 052 B woff2) nạp ở cả 4 trang nhưng `index`/`login`/`tournament` dùng **0** icon bold (chỉ `room.html` dùng 2); (b) 45/1530 icon được dùng thực tế — 97% CSS và glyph là thừa; (c) `font-display: block` giấu icon tới ~3s trong khi `manrope/style.css` cùng repo đã dùng `swap` — tổng 461 274 B đang tải cho ~11-18 KB thực cần `[Model: Opus 5]` — [chi tiết](docs/todo/B108-phosphor-icon-font-qua-nang.md)
- ✅ **#109.** Production đang chạy chế độ dev: `NODE_ENV` không đặt ở `start.sh` lẫn `.env` (xác nhận qua `/proc/<pid>/environ` của tiến trình thật) nên `server/index.js:63` phục vụ `client/` thô — 26 request/878 KB cho trang sảnh thay vì bundle đã gộp; **nhưng KHÔNG được sửa bằng cách chỉ đặt `NODE_ENV=production`** vì `dist/` build từ 08-08 còn `client/` sửa tới 08-12, làm vậy sẽ đẩy production lùi về trước #103/#104/#95-#102 — vấn đề thật là không có bước nào đảm bảo `dist/` được build lại (đúng cơ chế hỏng của #65); **ĐO LẠI 2026-08-12: HẠ ƯU TIÊN, ĐỔI PHẠM VI** — `dist/` vẫn kẹt ở 08-08 nên nay còn thiếu cả #107 lẫn #108, bật `NODE_ENV=production` bây giờ sẽ *xoá* các fix vừa làm; đồng thời lợi ích gộp request đã teo đi vì #106 khiến lần vào lại chỉ còn 2 request về origin — việc cần quyết không phải "bật production" mà là **hoặc dựng bước build có kiểm chứng, hoặc xoá hẳn `dist/`** để bỏ cái bẫy này ; **ĐÃ LÀM 2026-08-12** (`fix/remove-stale-dist-branch`, người dùng chọn phương án): **xoá hẳn nhánh `NODE_ENV==='production' ? dist : client`** và xoá thư mục `dist/` cục bộ (3 MB, không được git theo dõi) thay vì dựng bước build — vì #105+#106+#111 đã kéo lần-vào-lại xuống 0 byte nên bundle gần như hết tác dụng, và bỏ nhánh thì không còn bản sao thứ hai để lệch pha; **deviation có chủ ý** so với instruction ("không xoá `dist/`"), đã ghi rõ lý do; xác minh bằng cách chạy thật với `NODE_ENV=production` → phục vụ đúng `client/` hiện tại, 4 test mới, `npm test` 1118/1118 `[Model: Opus 5]` — [chi tiết](docs/todo/B109-production-chay-che-do-dev-dist-cu.md)
- ✅ **#110.** `client/js/i18n.js` (73 467 B) ship cả từ điển `vi` lẫn `en` dù mỗi phiên chỉ dùng một — nhưng lợi ích thật sau nén chỉ ~8-9 KB (không phải 36 KB) vì 2 từ điển cấu trúc giống nhau nên nén rất tốt; ưu tiên thấp nhất nhóm, chỉ cân nhắc sau khi #105-#108 xong và đo lại; **ĐÃ ĐO LẠI 2026-08-12 → ĐỀ NGHỊ ĐÓNG, không làm** — lợi thật chỉ **4 795 B** brotli (còn thấp hơn cả ước tính 8-9 KB cũ: full 14 225 B → runtime+`vi` 9 430 B), tức ~0,8% của 570 KB trang sảnh, lại đúng loại asset mà #106 đã cho cache vĩnh viễn nên chỉ tải một lần; không đáng đổi lấy rủi ro biến `i18n.js` thành bất đồng bộ ; **ĐÃ ĐÓNG, KHÔNG SỬA (2026-08-12)** — người dùng chốt sau khi có số đo: lợi thật chỉ **4 795 B** brotli (~0,8% trang sảnh), lại nằm trên asset `immutable` chỉ tải một lần, không đáng đổi lấy việc biến `i18n.js` thành bất đồng bộ ở rất nhiều call site `[Model: Opus 5]` — [chi tiết](docs/todo/B110-i18n-ship-ca-2-ngon-ngu.md)
- ✅ **#111.** `/socket.io/socket.io.min.js` do middleware riêng của socket.io phục vụ (không qua `express.static`) nên **không được #106 sửa** — vẫn trả `Cache-Control: public, max-age=0` + `ETag: "4.8.3"`, tức sau #106 nó là asset DUY NHẤT (ngoài `*.html` cố ý `no-cache`) còn round-trip về origin mỗi lần tải trang, trên cả 4 trang; đo được 23/25 request trang sảnh đã `immutable`, chỉ còn 2 phải hỏi lại origin — 304 vẫn tốn trọn một round-trip qua tunnel, đúng loại hay vọt 0.88-1.03s; **cẩn thận: URL này KHÔNG có `?v=N`** nên không được dán `immutable` (sẽ ghim bản socket.io cũ tới 1 năm) ; **ĐÃ LÀM 2026-08-12** (`fix/socket-io-client-cache-control`): cả 2 hướng đề xuất ban đầu đều bị bác bỏ bằng probe (engine.io chiếm trọn prefix `/socket.io/` ở tầng HTTP server nên Express không hề thấy request; `max-age=0` hardcode trong `socket.io/dist/index.js:360`), nên phục vụ file từ `/vendor/socket.io/` với `max-age=86400` (KHÔNG `immutable`) và giữ `serveClient` bật để HTML/`dist/` cũ không vỡ; Chromium thật: lần vào lại **25/25 resource từ cache, 0 byte qua mạng**, 13 test mới, `npm test` 1114/1114 `[Model: Opus 5]` — [chi tiết](docs/todo/B111-socket-io-client-bo-qua-static-cache-control.md)

### Nguồn: xác minh nhóm #105-#111 qua domain thật sau khi người dùng khởi động lại server (2026-08-12)
- ✅ **#112.** Cloudflare tự chèn beacon Web Analytics ở biên nhưng CSP (`script-src 'self'`, từ #65) chặn → **3 lỗi console mỗi lần tải trang** và Web Analytics không thu được số liệu nào; đã kiểm chứng KHÔNG do repo (`grep` client/ không có, HTML origin vs CF giống hệt từng byte 25 237 B) và KHÔNG do nhóm #105-#111; cần người dùng chọn: (A) tắt Web Analytics trên dashboard — khuyến nghị, hoặc (B) thêm `static.cloudflareinsights.com` vào `scriptSrc` (phải đo cả `connectSrc`) ; **ĐÃ LÀM 2026-08-12** (`fix/csp-allow-cloudflare-insights`, người dùng chọn hướng B): **beacon tải từ `static.cloudflareinsights.com` nhưng gửi số liệu tới `cloudflareinsights.com/cdn-cgi/rum` — HAI host khác nhau**, đọc thẳng trong `beacon.min.js` (chỉ allowlist host script thì beacon chạy nhưng vẫn không gửi được gì); thêm đúng 2 host pin tuyệt đối vào `scriptSrc`+`connectSrc`, Chromium thật xác nhận cả 2 qua được **và nhóm đối chứng `unpkg.com`/`example.com` vẫn bị chặn**; 6 test mới, `npm test` 1124/1124; **còn chờ người dùng restart server để xác minh 3 lỗi console → 0 trên domain thật** `[Model: Sonnet 5]` — [chi tiết](docs/todo/B112-cloudflare-insights-beacon-bi-csp-chan.md)

### Nguồn: yêu cầu người dùng qua chat — "Slot: Display info: 1. Name 2. Status (màu theo trạng thái) + Site track" (2026-08-13)
- ✅ **#113.** Slot card chỉ có 2 trạng thái (xanh lá sẵn sàng / xám chưa sẵn sàng), không phân biệt được người chơi có thật sự đang ở trang hay không; yêu cầu thêm đỏ ("leave site" — tab mở nhưng không active, Page Visibility API) và cam ("disconnected" — mất kết nối thật, server-side); **ĐÃ LÀM 2026-08-13** (`feature/room-slot-presence-status` off `dev`, vì đụng `server/` nên không đi qua `ui/*` đang mở): field `presence` mới trên room user + `RoomManager.setPresence()` (client chỉ set active/away, no-op nếu đang `disconnected` — chống race với grace period); `DisconnectHandler.js`/`SocketHandler.js` set/clear `disconnected` ở cả 6 điểm start/cancel-grace; client lắng nghe `visibilitychange`, gộp UI vào `playerStatusInfo()`/`renderStatusDot()` dùng chung slot card + mobile strip; 7 test mới + xác minh trực tiếp bằng Playwright 2 trình duyệt thật (ẩn tab → đỏ, đóng tab → cam, đều xác nhận trên DOM), `npm test` 1131/1131 `[Model: Sonnet 5]` — đã merge vào `dev`, **chưa** có trên `main` hay `ui/zen-minimal` (sẽ tự có khi nhánh đó merge vào `dev`) ; **BỔ SUNG 2026-08-13, ĐÃ LÀM**: (1) bỏ chữ trạng thái ("Chưa sẵn sàng"/...) — chỉ còn 1 dot màu (7px→9px), nhãn cũ chuyển sang `title`/`aria-label` (không mất a11y); (2) bỏ badge "Chủ phòng" khỏi slot card (badge "CP" ở danh sách người xem không đụng, khác phạm vi); CSS `.ready-text` xoá hẳn (không còn nơi dùng); `?v=` 106→107; xác minh lại bằng Playwright trên markup thật — [chi tiết](docs/todo/B113-slot-status-presence.md)

### Nguồn: báo cáo người dùng qua chat — "User status is not track, start game reset to inactive" (2026-08-13)
- ✅ **#114.** Slot dot (#113) dùng `player.ready` làm nhánh mặc định — `startGame()` set `ready = false` cho cả 2 người chơi khi ván bắt đầu nên dot rớt về màu "chưa sẵn sàng" ngay lúc ván chạy, nhìn như trạng thái reset sai; đã hỏi lại 3 vòng chốt thiết kế: Active/Inactive **không phải** idle-timer mà lấy thẳng từ `room.state === 'playing'` (game đã bắt đầu hay chưa), phạm vi CHỈ 2 slot người chơi, Leave/Disconnect giữ nguyên trigger `presence` như #113, đảo màu Leave↔Disconnect theo quy ước semaphore chuẩn (xanh/xám/cam/đỏ tăng dần mức nghiêm trọng); **ĐÃ LÀM 2026-08-13** (`feature/slot-status-active-inactive` off `dev`): 4 test mới + `npm test` 1135/1135, xác minh Playwright 2 trình duyệt thật (dot đổi đúng màu/nhãn khi bắt đầu ván và khi rời tab), màu thực tế đọc qua `getComputedStyle` khớp bảng đã chốt `[Model: Sonnet 5]` — [chi tiết](docs/todo/B114-slot-status-active-inactive-thay-ready.md)

### Nguồn: báo cáo người dùng qua chat — "Viewer in room when disconnect and reconnect cannot come back room where they left" (2026-08-14)
- ✅ **#115.** Viewer hiện bị `startSpectatorGrace()` giới hạn 30s (`SPECTATOR_GRACE_MS`) giống hệt seated-player-khi-ván-chưa-`ongoing` — người dùng xác nhận thời gian mất kết nối thực tế dài hơn 30s và chốt yêu cầu: role **Viewer** (chưa ngồi ghế, `slot === null`) phải reconnect quay lại đúng phòng được **bất kỳ lúc nào**, không giới hạn thời gian, MIỄN LÀ phòng còn tồn tại; nếu phòng đã bị huỷ thì về sảnh chờ như hành vi `ROOM_GONE` sẵn có; player ngồi ghế khi ván chưa `ongoing` vẫn giữ nguyên 30s như cũ (không phải Viewer nữa dù ván chưa chạy); **đã chốt (2026-08-14): không cần cơ chế dọn "viewer ma" nào thêm** — Viewer bỏ đi vĩnh viễn nằm lại `room.users` tới khi phòng tự huỷ theo cơ chế sẵn có là tác dụng phụ được chấp nhận; **ĐÃ LÀM 2026-08-14** (`fix/viewer-reconnect-unlimited` off `main`): tách nhánh cuối `handleDisconnect()` theo `slot` — Viewer chỉ set `presence = 'disconnected'` + broadcast, không set timeout; seated player chưa vào ván giữ nguyên `startSpectatorGrace`; không đụng `RoomManager.joinRoom()`/`startDisconnectGrace`/`startEmptyRoomGrace`; 3 test mới + cập nhật đếm call-site inventory (B113) 21→22, `npm test` 1134/1134 `[Model: Sonnet 5]` — [chi tiết](docs/todo/B115-viewer-reconnect-khong-gioi-han-thoi-gian.md)

### Nguồn: báo cáo người dùng qua chat — "Lobby load (display table) a bit slow when multi player" (2026-08-14)
- ✅ **#117.** Lobby (`client/js/lobby.js`) render lại **toàn bộ** danh sách phòng (`renderRoomList`
  qua `innerHTML`) mỗi khi nhận `lobby:patch`, dù server đã gửi diff `{ upserts, removed }` —
  chi phí render tăng theo tổng số phòng × tần suất sự kiện, không phải theo số phòng thực sự đổi;
  càng nhiều người/phòng đồng thời càng lộ rõ. **ĐÃ LÀM 2026-08-14** (`fix/lobby-render-full-list-
  on-patch` off `main`): thêm `applyLobbyPatch()`/`updateRoomRowNode()`/`buildRoomRowHtml()` — áp
  `upserts`/`removed` trực tiếp lên DOM hiện có qua `data-room-id`, chỉ fallback full-render khi
  vượt biên rỗng↔không-rỗng; `renderRoomList()` giữ nguyên cho full-snapshot/`langchange`/
  `uimodechange`; `?v=` 118→119; không có Jest cho `client/js/`, xác minh bằng 1 spec Playwright
  mới giữ lại (`e2e/lobby-patch-incremental-render.spec.ts`) — `MutationObserver` thật trên
  Chromium (seed 4 phòng, đổi đúng 1 phòng → chỉ phòng đó bị đụng DOM, `#room-list` không rebuild
  toàn bộ) `[Model: Sonnet 5]` — [chi tiết](docs/todo/B117-lobby-render-lai-toan-bo-khi-patch.md)

---

<!-- Khi nhận báo cáo mới: thêm heading "### Nguồn: <tên báo cáo>" dưới đúng
     Phần A hoặc Phần B, tạo file chi tiết mới trong docs/todo/ (giữ định dạng
     số thứ tự + đánh giá hiệu quả/an toàn + trạng thái test như các mục trên),
     rồi thêm 1 dòng index trỏ tới file đó ở đây. -->
