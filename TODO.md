# TODO

Quy ước: file này tách làm 2 phần.

- **Phần A — Không sửa được bằng code.** Cần công cụ ngoài, quyết định triển khai
  thật, phần cứng/hạ tầng, hoặc kiểm chứng mà agent không tự làm được trong repo.
- **Phần B — Sửa được bằng code, đang chờ làm.** Việc thật sự có thể implement
  trong repo này, liệt kê theo báo cáo nguồn, kèm giải pháp + đánh giá hiệu quả/an
  toàn + trạng thái unit test (theo rule "Bug-fix workflow" trong `CLAUDE.md`).

Khi có báo cáo mới, mục nào không sửa được bằng code → thêm vào Phần A; mục nào
sửa được → thêm vào Phần B, dưới một heading nguồn riêng (giữ nguyên theo report).

---


## Phần A — Không sửa được bằng code

### Nguồn: `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)
- **#1.** TLS/HTTPS trước app (review 3.0) — Nghiêm trọng nếu đang chạy HTTP trần — [chi tiết](docs/todo/A01-tls-https-truoc-app-review-3-0-nghiem-trong-neu-dang-chay.md)
- **#2.** Xác nhận biến môi trường khi deploy thật — [chi tiết](docs/todo/A02-xac-nhan-bien-moi-truong-khi-deploy-that.md)
- **#3.** `npm install` không chạy được trên Node 24 tại máy đánh giá — [chi tiết](docs/todo/A03-npm-install-khong-chay-duoc-tren-node-24-tai-may-danh-gia.md)
- **#4.** Kiểm chứng thật cho các mục "CHƯA ĐO ĐƯỢC" trong review — [chi tiết](docs/todo/A04-kiem-chung-that-cho-cac-muc-chua-do-duoc-trong-review.md)

### Nguồn: stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)
- **#6.** Quyết định kiến trúc khi cần scale quá 1 tiến trình — [chi tiết](docs/todo/A06-quyet-dinh-kien-truc-khi-can-scale-qua-1-tien-trinh.md)
- ✅ **#7.** Đo lại bằng harness đa tiến trình (hoặc máy thứ 2) — [chi tiết](docs/todo/A07-do-lai-bang-harness-da-tien-trinh-hoac-may-thu-2.md)
- **#8.** Chưa có cách quan sát heap/GC của server đang chạy — [chi tiết](docs/todo/A08-chua-co-cach-quan-sat-heap-gc-cua-server-dang-chay.md)

### Nguồn: security review toàn bộ codebase (2026-08-03, yêu cầu người dùng "Does my website safe?")
- **#9.** Audit an ninh toàn bộ server + client — không phải diff, không có PR đang mở — [chi tiết](docs/todo/A09-audit-an-ninh-toan-bo-server-client-khong-phai-diff-khong.md)

### Nguồn: kiểm chứng bản sửa (commit `3da53dd`, đo lại 2026-08-01)
- **#5.** Mục 3.8 "vòng đời mật khẩu" — cần nội dung đầy đủ — [chi tiết](docs/todo/A05-muc-3-8-vong-doi-mat-khau-can-noi-dung-day-du.md)

### Nguồn: `gomoku-vn-review(1).md` vòng 3, mục 12.6 (kiểm chứng 2026-08-02)
- ✅ **#10.** Hành vi thật của `cloudflared` với `X-Forwarded-For` do client tự gửi — [chi tiết](docs/todo/A10-hanh-vi-that-cua-cloudflared-voi-x-forwarded-for-do-client.md)
- **#11.** Hành vi khi bật `permessage-deflate` — [chi tiết](docs/todo/A11-hanh-vi-khi-bat-permessage-deflate.md)

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
- **#29.** Trần >6000 người vẫn chưa quy được nguyên nhân — sau khi sửa backlog, — [chi tiết](docs/todo/B29-tran-6000-nguoi-van-chua-quy-duoc-nguyen-nhan-sau-khi-sua.md)

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
- **#55.** Trận đấu giải đấu không áp dụng/đồng bộ click mode từ Cài đặt — khác hành vi với phòng chơi thường — [chi tiết](docs/todo/B55-tran-dau-giai-dau-khong-ap-dung-dong-bo-click-mode-tu-settings.md)

### Nguồn: phát hiện phụ khi làm #52 (2026-08-07)
- **#56.** Mobile: nội dung tab (Nước đi/Trò chuyện/Khán giả) co về ~0 chiều cao ở `tournament-match.html`; nghi vấn `tournament.html` cùng lỗi `.lobby-layout` phantom sidebar 260px — [chi tiết](docs/todo/B56-tournament-match-mobile-tab-content-collapse-va-lobby-layout.md)

---

<!-- Khi nhận báo cáo mới: thêm heading "### Nguồn: <tên báo cáo>" dưới đúng
     Phần A hoặc Phần B, tạo file chi tiết mới trong docs/todo/ (giữ định dạng
     số thứ tự + đánh giá hiệu quả/an toàn + trạng thái test như các mục trên),
     rồi thêm 1 dòng index trỏ tới file đó ở đây. -->
