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

### Nguồn: `gomoku-vn-review-2026-08-14.md` vòng 4, mục 13.9b (2026-08-14, đối chiếu code 2026-08-15)
- **#125.** Cloudflare xoá `ETag` của HTML khi tự nén lại — cần bật "Respect Strong ETags" trên dashboard Cloudflare để khôi phục; không hỏng gì hiện tại (`If-Modified-Since` vẫn trả 304), không gấp `[Model: Haiku 4.5]` — [chi tiết](docs/todo/A125-cloudflare-respect-strong-etags-cho-html.md)

### Nguồn: phân tích 2 file HAR + log/metrics `cloudflared` — "connection looks slow, CPU ran for 2 day" (2026-08-19)
- ✅ **#130.** Tunnel `cloudflared` re-register 19 lần / 3 ngày — **điều tra xong 2026-08-19, KHÔNG phải lỗi và không phải nguyên nhân site chậm**: log cho thấy toàn bộ là `Application error 0x0 (remote)` = Cloudflare edge chủ động đóng bình thường, mỗi lần chỉ 1/4 connection, nối lại 1–14 s, lần gần nhất cách thời điểm chụp HAR 12 tiếng; con số 19 chỉ là bộ đếm tích luỹ theo uptime, không phải hệ quả của "chạy lâu". Origin Node cũng nhàn rỗi (10 s CPU / 2,6 ngày, `cfOrigin;dur=63`). Nguyên nhân thật của 24 s chờ nằm ở chặng trình duyệt ↔ Cloudflare edge (mất gói SYN, `connect=7196ms`) + `timeout` 20 s phía client (#131). **ĐÃ NÂNG `cloudflared` 2026.7.3→2026.8.2 lúc 2026-08-19 23:56** (4/4 connection đăng ký lại trong 3 s, `/ready` 200, site 200, **không** restart server game). Đo lại bắt tay WS: 12/12, median 256 ms (trước 11/12, median 5074 ms) — **nhưng không quy công cho bản nâng**: `mtr` ngay sau đó cho 0% loss toàn tuyến, tức đợt mất gói ISP đã tự hết cùng cửa sổ thời gian ⇒ cải thiện là do mạng hồi phục, bản nâng đúng là bảo trì thuần hiệu quả ~0 `[Model: Opus 5]` — [chi tiết](docs/todo/A130-cloudflared-quic-flap-chuyen-sang-protocol-http2.md)

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

### Nguồn: báo cáo người dùng qua chat kèm ảnh chụp màn hình mobile — "Score Board took space of Chat Box on phone" (2026-08-14)
- ✅ **#116.** Trang phòng chơi (`client/room.html`) trên mobile: `.score-panel` (bảng điểm Thắng/Bại/Hoà)
  nằm cố định phía trên khối tabs, luôn hiển thị đè lên không gian của tab Chat (mặc định active),
  khiến khung chat co lại chỉ còn ~2 dòng trước khi phải cuộn; đề xuất của người dùng: tách Bảng điểm
  ra tab riêng thay vì hiển thị cố định. **SỬA PHẠM VI 2026-08-14**: bản ghi đầu tiên trỏ nhầm vào
  `client/tournament-match.html` (2 trang dùng cấu trúc gần giống hệt) — đã sửa lại đúng `room.html`/
  `room-ui.js`. **ĐÃ LÀM 2026-08-14** (người dùng chọn qua hỏi lại: tab riêng, áp dụng mọi kích thước
  màn hình, chỉ `room.html`): score-panel chuyển vào tab-content `#tab-score` mới (icon `ph-trophy`,
  i18n `room.tab_score`), `renderScoreTable()` đổi sang ẩn/hiện nút tab thay vì panel, CSS scoped
  riêng cho `room.html`/`room-zen.css` không đụng `tournament-match.html`; `?v=` 119→120; `npm test`
  1138/1138; xác minh Playwright thật 2 guest, mobile 390×844 — tab điểm ẩn tới khi có kết quả, đúng
  cột T/Th/H sau khi đầu hàng, chat giữ nguyên chiều cao đầy đủ `[Model: Sonnet 5]` — `tournament-match.html`
  **chưa sửa** (người dùng chọn "chỉ room trước") — [chi tiết](docs/todo/B116-tournament-match-scoreboard-lan-chiem-mobile-chat.md)

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

### Nguồn: báo cáo người dùng kèm ảnh chụp Safari iOS thật — "UI sometimes become unstable and distort/wrong responsive" (2026-08-14)
- ✅ **#118.** Bàn cờ (`room.html`) thỉnh thoảng méo/lệch trên mobile — sửa phòng ngừa: `.board-area-shell` thêm `height: 100dvh` (fallback `100vh`), `window resize` listener ở `game-ui.js` gate qua `requestAnimationFrame`; **chưa tái hiện được** do không có thiết bị Safari iOS, người dùng chốt sửa phòng ngừa và xác nhận sau khi deploy. **ĐÃ LÀM 2026-08-14** (`fix/mobile-board-resize-dvh` off `main`): `.board-area-shell` (`room.css:59`, `room-zen.css:302`) thêm dòng `height: calc(100dvh - ...)` sau dòng `100vh` gốc; `game-ui.js:113-125` gate resize handler qua `requestAnimationFrame` + cờ `_boardResizePending`; `?v=` 120→121 `[Model: Sonnet 5]` — [chi tiết](docs/todo/B118-ban-co-mobile-meo-lech-khong-on-dinh-do-resize-khong-throttle.md)

### Nguồn: báo cáo người dùng kèm ảnh chụp modal Settings — "guest user report they cannot create account by click Create Account in Settings. He must log out and create account outside." (2026-08-14)
- ✅ **#119.** Guest bấm "Create account" trong Settings (`settings-panel.js`, `<a href="login.html">`)
  bị `login.html`'s `checkExistingSession()` tự bounce ngược về `index.html` ngay lập tức, vì
  `hasBelievedSession()` không phân biệt session guest với session thật. **ĐÃ LÀM 2026-08-14**
  (`fix/guest-create-account-bounce` off `main`): `login.js` đọc thêm `GvnSession.getUser().isGuest`,
  chỉ bounce khi session KHÔNG phải guest; đã kiểm tra `socket-client.js`/`session.js`'s
  `hasBelievedSession()` khác — không cần sửa (hướng ngược lại, page-guard cho trang cần đăng nhập,
  guest vẫn hợp lệ ở đó); 3 test mới trong `login-oauth-error-banner.test.js`, `npm test` 1139/1139
  `[Model: Sonnet 5]` — [chi tiết](docs/todo/B119-guest-khong-tao-duoc-tai-khoan-tu-nut-create-account.md)

### Nguồn: báo cáo người dùng — "Login page should have Language Toggle (Vietnamese/English)" (2026-08-14)
- ✅ **#120.** `login.html` không có nút đổi ngôn ngữ — không phải tính năng chưa xây: `i18n.js`'s
  auto-init đã có sẵn logic mount `createLangSwitcher()`, nhưng nhắm vào `.card__logo`, class thuộc
  bản layout login cũ mà redesign `page-split`/`login-shell` không còn mang theo. **ĐÃ LÀM
  2026-08-14** (`fix/login-language-toggle` off `main`): thêm mount point mới
  `.login-lang-switch-row` trong `login.html` + CSS căn phải trong `login.css`; đổi đúng 1 dòng
  selector trong `i18n.js` sang mount point mới, không viết lại cơ chế switcher; xác minh bằng
  Playwright thật (desktop + mobile 390×844, đổi ngôn ngữ đúng toàn trang, round-trip đúng, không
  tràn ngang trên mobile) qua static server cục bộ, không đụng `server/index.js`/database thật; 4
  test mới trong `login-lang-switch-mount.test.js` (jsdom), `npm test` 1143/1143; `?v=` 122→123
  `[Model: Sonnet 5]` — [chi tiết](docs/todo/B120-login-html-thieu-language-toggle-do-selector-cu-hong.md)

### Nguồn: báo cáo người dùng — "Scope: Room. Replace room name (default): 'phòng của ...' -> ID (#...)" (2026-08-14)
- ✅ **#121.** Tên phòng mặc định (`RoomManager.js:130`, `Phòng của ${displayName}` khi không đặt tên
  tuỳ chỉnh) đổi thành `#<roomID>` (ví dụ `#A3F`) — không chữ "Phòng", không tên host. **ĐÃ LÀM
  2026-08-14** (`fix/room-default-name-id` off `main`): tái dùng `roomId` đã sinh sẵn ở dòng trên,
  không sinh thêm giá trị mới; nhánh tự đặt tên giữ nguyên; 2 test mới trong
  `RoomManager.test.js` (`'RoomManager — default room name'`), `npm test` 1136/1136 `[Model: Sonnet
  5]` — [chi tiết](docs/todo/B121-doi-ten-phong-mac-dinh-sang-id-phong.md)

### Nguồn: `gomoku-vn-review-2026-08-14.md` vòng 4 (2026-08-14, đối chiếu code + xác nhận thêm từ người dùng 2026-08-15)
- ✅ **#122.** `client/room.html:202` nạp `profanity-classifier-model.js` (53 KB, 18 971 B nén) đồng bộ, chặn parser, dù classifier đã bị tắt theo quyết định sản phẩm (`profanity-filter.js:801-804`) và đã chứng minh không đổi output nào (54 chuỗi thử, 2 VM context) — bỏ hẳn thẻ `<script>` này `[Model: Haiku 4.5]` — [chi tiết](docs/todo/B122-bo-profanity-classifier-model-khoi-room-html.md)
- ✅ **#123.** Thêm `<link rel="preload" as="font">` cho `Phosphor.woff2`/`Phosphor-Bold.woff2` — người dùng tự xác nhận trực tiếp: "đôi lúc mạng chậm, những icon này (Settings, history, create) load chậm hơn các element khác", khớp cơ chế `font-display: swap` + font bị phát hiện muộn qua CSSOM; **ĐÃ LÀM 2026-08-15**: preload đúng số weight/trang trên cả 6 trang thật, bump `?v=126`→`?v=127` toàn bộ (verify grep còn đúng 1 giá trị), chưa verify DevTools thủ công trên mạng chậm thật `[Model: Sonnet 5]` — [chi tiết](docs/todo/B123-preload-font-phosphor-woff2-giam-do-tre-hien-thi-icon.md)
- ✅ **#124.** `server/utils/get-client-ip.js:48` nhánh fallback `X-Forwarded-For` lấy phần tử **đầu** (`split(',')[0]`, dễ giả mạo nhất) thay vì phần tử **cuối** — mức độ thấp vì traffic thật qua Cloudflare luôn có `CF-Connecting-IP` nên nhánh này không bị chạm tới trên đường đi thực tế, nhưng vẫn nên sửa cho đúng; **ĐÃ LÀM 2026-08-15**: đổi `split(',')[0].trim()` → `split(',').pop().trim()`, đúng 1 dòng, không đụng ưu tiên `CF-Connecting-IP`/điều kiện loopback; thêm case mới trong `get-client-ip.test.js` và cập nhật 2 case cũ có nhiều giá trị XFF sang kỳ vọng phần tử cuối; `get-client-ip.test.js` + `LobbyHandler.test.js` 29/29 pass `[Model: Sonnet 5]` — [chi tiết](docs/todo/B124-getclientip-xff-lay-phan-tu-cuoi-thay-vi-dau.md)
- ✅ **#126.** Thêm `modulepreload` cho 11 ES module (`room.html`) / 7 module (`index.html`) đang nằm sau rào cản parse — đo lường bắt buộc qua HTTP/2 domain thật (không phải localhost), lặp ≥7 lần lấy min/median, kèm test canh hint↔import không lệch để tránh bẫy tải file 2 lần âm thầm; **ĐÃ LÀM 2026-08-15**: hint khớp đúng import thật + test drift + bump `?v=128`, đo qua `play3cr.dpdns.org` (Playwright, login/tạo phòng thật) xác nhận **0 double-load**, nhưng chưa xác định được số mili-giây tiết kiệm cụ thể (nằm trong nhiễu đo/phương pháp) `[Model: Sonnet 5]` — [chi tiết](docs/todo/B126-modulepreload-cho-es-module-do-tren-domain-that-qua-tunnel.md)
- **#127.** ⚠️ (làm SAU CÙNG, cùng nhóm STRICT với #126) Gộp CSS theo trang — bỏ `lobby.css` thừa khỏi `room.html` (nạp theo lịch sử tách file, không theo trang) — cần grep xác nhận không class nào của `lobby.css` đang thật sự dùng ở `room.html` trước khi bỏ, xác minh bằng trình duyệt thật (không chỉ đoán) vì dễ vỡ layout âm thầm `[Model: Sonnet 5]` — [chi tiết](docs/todo/B127-gop-css-theo-trang-bo-lobby-css-thua-o-room.md)

### Nguồn: yêu cầu người dùng — thảo luận qua `features/undo/` (2026-08-15)
- ✅ **#128.** Thêm tính năng Undo (hoàn tác nước đi) trong `room.html` — đối thủ phải đồng ý, không giới hạn số lần, quy tắc lõi "đi lại về đúng lượt người yêu cầu" (xoá 1 nước nếu đối thủ chưa đáp trả, xoá cả 2 nếu đã đáp trả), vẫn cho phép trong khai cuộc Swap2, chỉ khôi phục đồng hồ chế độ `per_move`, yêu cầu đang chờ hiện lại khi đối phương reconnect, không chặn luồng chơi (chỉ tự huỷ khi chính người yêu cầu đi tiếp). **ĐÃ LÀM 2026-08-15** (`feature/undo` off `dev`): 23 unit test mới (`GameEngine.test.js`, `play` + Swap2 opening), `npm test` 1185/1185; xác minh trực tiếp bằng Playwright thật 2 trình duyệt (`e2e/undo.spec.ts`, 6 test, server cô lập cổng riêng + db tạm, không đụng server/db thật đang có người chơi); `?v=128→129` `[Model: Sonnet 5]` — [chi tiết](docs/todo/B128-them-tinh-nang-undo-hoan-tac-nuoc-di-o-room-html.md)

### Nguồn: phân tích HAR báo cáo "site chậm" (người dùng ở Mỹ, 2026-08-17) — câu hỏi trực tiếp về Phosphor/SVG
- ✅ **#129.** Thay font icon Phosphor bằng SVG sprite — **override quyết định "không làm" của #108**
  (người dùng chủ động yêu cầu sau khi được báo rõ lý do cũ); audit runtime (Playwright, 11 icon,
  hội tụ đúng tập static) + grep tĩnh mở rộng (46 icon/53→43 tổ hợp thật) trước khi build, đúng quy
  trình đã đặt ra. **ĐÃ LÀM 2026-08-17**: migrate 63 chỗ `<i class="ph...">` sang `<svg><use>` +
  sprite ngoài (không inline — quyết định lúc làm, xem chi tiết), 297 KB font → ~7 KB gzip sprite,
  giữ nguyên file font gốc để rollback, `npm test` 1185/1185, xác minh 0 symbol thiếu qua Playwright
  thật trên 5 trang `[Model: Sonnet 5]` — [chi tiết](docs/todo/B129-svg-icon-thay-phosphor-audit-truoc-khi-lam.md)

### Nguồn: phân tích 2 file HAR người dùng cung cấp — "connection looks slow" (2026-08-19), phần sửa được bằng code
- ✅ **#131.** `client/js/socket-client.js` không đặt `timeout` nên dùng mặc định 20 000 ms của socket.io-client — trong HAR, lần handshake đầu chết vì mất gói SYN (chặng trình duyệt ↔ Cloudflare edge), người chơi chờ đủ 20 s rồi lần thử lại chỉ mất 2.9 s là xong (tổng ~24 s treo ở "Đang kết nối…"). **ĐÃ LÀM 2026-08-19** (`fix/socket-io-connect-timeout` off `dev`): thêm `timeout` đúng 1 dòng (**retune 8000→12000** cùng ngày sau khi đo phân bố thật: `mtr` cho thấy ~17% mất gói từ hop 8 của nhà mạng, 12 lần bắt tay WS trải 1.9–7.948 s ⇒ 8000 nằm trên đỉnh phân bố, sẽ cắt nhầm), giữ nguyên transport websocket-first + mọi tham số `reconnection*`; 8 test mới `client/tests/socket-client-connect-options.test.js` (kiểm chứng không rỗng: bỏ bản sửa ra thì 4/8 fail), `npm test` 1193/1193; xác minh Playwright trên instance **cô lập** (copy repo + DB tạm + cổng 3111, không đụng DB/server thật đang có người chơi) — luồng guest→tạo phòng→`room.html` connect 839 ms, `io._timeout=8000`, 0 console error, và **đo được cả đường thất bại**: 20 120 ms → **12 115 ms**; `?v=130→132`. Là **giảm thiệt hại**, nguyên nhân gốc (mất gói client↔edge) không sửa được bằng code `[Model: Opus 5]` — [chi tiết](docs/todo/B131-socket-io-client-timeout-20s-qua-lau-khi-mat-goi-syn.md)

### Nguồn: yêu cầu người dùng — phản hồi trực tiếp trên chụp màn hình phòng chơi iPhone (2026-08-19)
- ✅ **#132.** `#game-controls` (4 nút Đầu hàng/Đề nghị hoà/Xin thêm giờ/Xin đi lại) `flex-wrap: wrap` trên mobile khiến nút thứ 4 rớt xuống hàng riêng full-width, tốn chiều cao dọc trên điện thoại nhỏ — người dùng đề xuất trực tiếp: gộp 1 hàng cố định, cho cuộn ngang cục bộ trong khối nút (không cuộn cả trang), kiểu slider. **ĐÃ LÀM 2026-08-19**: `client/css/game.css` mobile breakpoint đổi `flex-wrap: wrap` → `nowrap` + `overflow-x: auto` + `scroll-snap-type: x proximity`, nút không co ép (`flex: 0 0 auto; min-width: 92px`), nút cuối cố ý cắt hụt khi tràn để gợi ý còn nội dung; Playwright phát hiện và sửa 1 bug thật lúc verify: `justify-content: center` kế thừa từ rule desktop khiến overflow bị cắt **đối xứng cả 2 đầu** ở `scrollLeft: 0` (nút đầu bị pre-clip, không cách nào cuộn tới) — thêm `justify-content: flex-start` cho đúng breakpoint mobile; xác minh bằng Playwright trên instance cô lập (copy repo + DB tạm + cổng 3111, không đụng server/DB thật đang có người chơi) qua trang test tĩnh load đúng CSS thật, đo `getBoundingClientRect()` ở `scrollLeft: 0` và `scrollLeft: max` xác nhận nút đầu/cuối đều tới được trọn vẹn + `window.scrollY` không đổi khi cuộn container (đúng yêu cầu "chỉ cuộn khối nút"); `?v=132→133` `[Model: Opus 5]` — [chi tiết](docs/todo/B132-game-controls-cuon-ngang-1-hang-thay-vi-wrap-2-hang.md)

### Nguồn: báo cáo trực tiếp người dùng qua chụp màn hình mobile (2026-08-21)
- ✅ **#133.** Mobile: đường kẻ bàn cờ (`board.js`, alpha 0.22 chế độ standard/caro) nhạt màu + bàn
  cờ nhỏ trên cả 2 trục do padding/budget tích luỹ qua nhiều lớp trong `resize()`/`room-zen.css`
  mobile. **ĐÃ LÀM 2026-08-21, 3 vòng** (`fix/mobile-board-grid-and-size` off `main`, merge vào
  `dev`): (1) grid alpha 0.22→0.4→**0.55** (người dùng xác nhận trên máy thật rồi yêu cầu đậm thêm),
  border cùng chỗ 0.4→0.65 để giữ đúng thứ bậc "border đậm hơn grid"; (2) trục dọc `viewportBudget`
  (zen mobile) bỏ double-count 50px budget non-zen, dùng đúng overhead zen thật
  (`canvasWrapBorder`+`turnBarMargin`+`controlsMargin`) — xác nhận +48px trên viewport height-bound
  (375×520: 263.4px→311.4px); (3) trục ngang — người dùng đo trên điện thoại thật thấy canvas 476 /
  shell 500 (24px) — bỏ side padding 8px/bên trong `room-zen.css` mobile + `- 8` thừa trong `maxVw`
  (chỉ với zen; non-zen giữ nguyên vì mẹo full-bleed của `room.css` vẫn cần nó), bàn cờ nay tràn sát
  mép (390 viewport → wrap 0–390, đo Playwright, `scrollWidth === innerWidth`, 0 console error).
  Xác minh toàn bộ trên instance cô lập (copy repo + DB tạm + cổng 3111 + `CORS_ORIGIN` riêng, không
  đụng server/DB thật); `client/js/` không test tự động, verify qua đo kích thước canvas +
  screenshot thật + xác nhận trực tiếp của người dùng trên máy thật. `npm test` 1143/1143,
  `?v=123→126` trên nhánh fix, **vòng 4** sau merge vào `dev`: merge trước đó giữ nguyên `?v=133`
  (nhầm — theo quy tắc `git-workflow` phải re-bump lên `max(dev,main)+1` vì nội dung file đã đổi
  thật, không chỉ giữ số cũ), sửa lại `?v=133→134` `[Model: Sonnet 5 / Opus 5]` — [chi
  tiết](docs/todo/B133-mobile-grid-line-nhat-va-ban-co-nho.md)

### Nguồn: báo cáo trực tiếp người dùng kèm ảnh chụp màn hình PC (2026-08-21)
- ✅ **#134.** Sidebar-tab (icon rail zen-skin) đôi khi "thụt vào trong" với hiệu ứng chồng ảnh khi
  redraw, nhất là ngay sau khi kết thúc ván. Người dùng tự tái hiện lại kèm ảnh chụp DevTools xác
  nhận `body.zen-drawer-collapsed` kẹt ở viewport 1920×935 — không phải mobile. **ĐÃ LÀM
  2026-08-21** (`fix/sidebar-drawer-collapsed-stuck` off `main`): nguyên nhân là
  `client/js/room-socket.js`'s `game:init` handler check `matchMedia('(max-width: 768px)')` một
  lần duy nhất rồi thêm `zen-drawer-collapsed`, không có chỗ nào gỡ class khi viewport rộng lại
  (bẫy một chiều — xác nhận bằng grep toàn bộ `client/js/*.js`, không có listener nào khác đụng
  class này). Thêm `matchMedia(...).addEventListener('change', ...)` trong `client/js/room.js`
  ngay sau `refitBoardAfterDrawer()` — chỉ **gỡ** class khi viewport hết hẹp, không bao giờ tự
  thêm (auto-collapse trên mobile vẫn là việc riêng của `game:init`, không đổi breakpoint hay cơ
  chế co giãn CSS hiện có của `.panel-right-shell`). 4 test mới
  `client/tests/room-zen-drawer-collapsed-recovery.test.js` (kiểm chứng không rỗng: bỏ bản sửa ra
  thì đúng 1/4 fail), `npm test` 1147/1147 (trước: 1143). `?v=135→136` `[Model: Sonnet 5]` — [chi
  tiết](docs/todo/B134-sidebar-tab-thut-vao-trong-khi-redraw.md)

### Nguồn: báo cáo người dùng — icon "zoom" bất thường trên sảnh chờ, kèm ảnh chụp (2026-08-21)
- ✅ **#135.** Điều tra icon to bất thường tìm ra `TODO.md #129` (migrate `<i class="ph...">` →
  `<svg class="icon">`) để sót nhiều CSS selector vẫn nhắm thẳng thẻ `i` cũ (không còn khớp markup
  thật), khiến icon rơi về kế thừa font-size từ cha thay vì rule riêng. **ĐÃ LÀM 2026-08-21**
  (`fix/svg-icon-migration-orphaned-selectors` off `dev` — bug chỉ tồn tại trên `dev`, `main` chưa
  merge #129 nên không dính). Sửa 6 vị trí (`i`→`.icon`): `lobby-zen.css` (`.link-action`,
  `.tournament-card__status`/`__meta`), `room.css`+`room-zen.css` (`.tab-btn`,
  `.quick-chat-bar button`), `history.css` (`.replay__back-btn`/`.replay__analysis-btn`). Đo bằng
  Playwright trên bản dựng tĩnh cô lập xác nhận đúng hướng (13px→15px, `.link-action .icon`). Đo
  lại trên production thật (đăng nhập khách qua UI thật, chỉ đo không đụng DB) **ngay lúc chưa
  deploy bản sửa** đã cho `15×15px` đúng, không hề to như báo cáo — nghi ngờ chính là cache trình
  duyệt/CDN không đồng bộ tại thời điểm chụp (đúng lúc đang bump `?v=` liên tục), không phải bug
  code dài hạn. **Người dùng xác nhận sau hard-refresh: hết hiện tượng "zoom"** — giả thuyết cache
  tạm thời đúng, bản sửa CSS vẫn giữ nguyên (bug thật dù nhỏ) nhưng độc lập với report gốc.
  `npm test` 1197/1197 (không đổi — thuần CSS). `?v=138→139`
  `[Model: Sonnet 5]` — [chi tiết](docs/todo/B135-svg-icon-migration-orphaned-css-selectors.md)

### Nguồn: người dùng đính chính #134 + đọc lại code base (2026-08-21)
- ⏳ **#136.** (Reopen #134) Người dùng đính chính: mô tả ở #134 chỉ là **một phần**, không phải mô
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
- ✅ **#137.** `#start-modal` (`position:absolute; inset:0; z-index:50`, `game.css:412-426`) neo vào
  `.board-area-shell` — trong zen shell này chiếm trọn chiều rộng viewport (chỗ của drawer chỉ là
  `padding-right`, `room-zen.css:282-292`) ⇒ lớp phủ modal **đè lên drawer** (z50 > z15 của
  `.panel-right-shell`, `.board-area-shell` không tạo stacking context) và **thẻ modal căn theo tâm
  viewport thay vì tâm bàn cờ**. **ĐÃ TÁI HIỆN 2026-08-21** (Playwright, Chromium 1440×900): lớp phủ
  `x=0,w=1440` chồng đúng **340px = 100%** chiều rộng drawer; tâm thẻ `x=720` vs tâm canvas `x=550`
  ⇒ lệch **170px**, đúng nửa `--zen-drawer-w`. **ĐÃ SỬA 2026-08-22:** cho lớp phủ tôn trọng
  `padding` của shell (trùng content box = hộp bàn cờ) trong `room-zen.css`, **giữ nguyên anchor**
  (không chuyển sang `#board-area` vì `GameUI.initBoard()` ghi đè `innerHTML`) và **giữ nguyên
  `z-index:50`** (hạ nó chỉ che triệu chứng). Thêm 1 dòng `inset` vào rule collapsed của nhánh mobile
  ≤768px vì rule desktop collapsed đặc hiệu hơn 1 class ⇒ sẽ rò xuống điện thoại (kiểm chứng: bỏ ra
  → fail 393 vs 337 = bề rộng rail). Đo lại trên instance cô lập: chồng lấn **340→0** / **56→0**,
  lệch tâm **170→0** / **28→0**; mobile không đổi một pixel (đúng thiết kế #139). 4 test mới
  `e2e/start-modal-board-centering.spec.ts` (bỏ bản sửa ra → 2 test desktop fail), §B36
  `start-modal-non-blocking` vẫn 2/2 pass, `npm test` **1213/1213**, `?v=141→142`
  `[Model: Opus 5]` — [chi tiết](docs/todo/B137-start-modal-phu-tron-viewport-de-len-drawer.md)
- ✅ **#138.** Drawer "đóng" chỉ là **cắt xén** (`overflow:hidden` trên shell, `.panel-right` vẫn
  rộng nguyên, `justify-content:flex-end` giữ rail lại) — đúng thiết kế, giải thích việc DevTools
  vẫn thấy khung chat. Nhưng thiếu nửa còn lại: không `inert`/`aria-hidden` ⇒ ô chat, nút Gửi vẫn
  nhận focus bằng Tab và vẫn được trình đọc màn hình đọc khi drawer đã đóng. **ĐÃ TÁI HIỆN
  2026-08-21**: đi Tab từ `#btn-leave` thì focus lọt vào `INPUT#chat-input` rồi `BUTTON#btn-send`.
  **ĐÃ SỬA 2026-08-22:** gom việc đổi class thành **một người ghi duy nhất** `setDrawerCollapsed()`
  trong `room.js` (kèm `syncDrawerInert()`), cả 3 nơi đổi class đều đi qua đó ⇒ class và `inert`
  không thể lệch pha (tránh đúng "nguồn sự thật thứ tư" mà §B138 cảnh báo). Chỉ `.panel-players` +
  các `.tab-content` bị `inert`, **không bao giờ** `.sidebar-tabs` (rail là cách duy nhất mở lại);
  chỉ áp dụng khi có cả `zen-room` lẫn `zen-drawer-collapsed`; không gate theo media query nên mobile
  (sheet `translateY`) được xử lý y hệt; focus trong vùng sắp `inert` được trả về nút rail của đúng
  tab đang mở. Đo Playwright (Tab thật, instance cô lập): điểm dừng vô hình **2 → 0** ở cả desktop
  1440×900 lẫn mobile 393×727, rail vẫn Tab tới được, quick-chat-bar mobile vẫn trong tab-order; mở
  lại drawer thì gõ/gửi chat thật OK, 0 console error; §B36 kiểm lại trực tiếp vẫn đúng. 14 test mới
  `client/tests/room-drawer-inert.test.js`, `npm test` **1227/1227**, `?v=142→143` `[Model: Opus 5]`
  — [chi tiết](docs/todo/B138-drawer-dong-chi-la-clip-noi-dung-van-focus-duoc.md)
- ✅ **#139.** 📵 **BLOCKER (mobile)** — nút "Bắt đầu" của start-modal bị bottom sheet che hoàn toàn,
  người chơi trên điện thoại **không vào được trận**. Đo trên `devices['Pixel 5']` (393×727): thẻ
  modal bị sheet che **183/210px = 87%**, phần tử nhận click ở tâm nút là `DIV.players-row` **bên
  trong drawer**, `page.click('#start-modal-btn')` **timeout**. Gốc: `.start-modal` `z-index:50`
  (`game.css:412-426`) vs `.panel-right-shell` `z-index:700` ở nhánh ≤768px
  (`room-zen.css:934-952`) — hai quyết định đúng riêng lẻ, chưa ai xét chung. `#start-modal-btn` là
  **lối duy nhất** để bấm Bắt đầu (grep `confirmStart` toàn repo). **ĐÃ LÀM 2026-08-21**
  (`fix/mobile-start-modal-behind-sheet` off `main`, đã merge vào `dev`; PR vào `main` **chờ người
  dùng xác nhận**): thuần CSS trong nhánh ≤768px của `room-zen.css` — `z-index: 750` (trên sheet)
  **cộng** neo lớp phủ vào dải trống giữa topnav và sheet (`position: fixed` +
  `height: max(180px, calc(100dvh - topnav - sheet-h))`, biến thể `--zen-bar-h` khi sheet thu), nhờ
  đó thẻ modal không đè sheet khi còn chỗ nên rail/ghế ngồi vẫn bấm được (§B36). **Không** dùng cách
  tự thêm `zen-drawer-collapsed` khi modal hiện (sẽ thành nguồn sự thật thứ tư cho class tâm điểm
  #134/#136). Verify bằng **chạm thật** `page.click()` ở 6 viewport: Pixel 5 phần bị che
  **183px→0px**, iPhone 12 / 360×560 / 700×600 / tablet / desktop đều vào được trận. 7 test mới
  `client/tests/room-zen-start-modal-above-sheet.test.js` (bỏ bản sửa ra → 5/7 fail), `npm test`
  **1150/1150** trên nhánh fix; `?v=135→136` trên nhánh, re-bump `139→140` khi merge vào `dev`
  theo `max(dev,main)+1` `[Model: Opus 5]` — [chi
  tiết](docs/todo/B139-mobile-nut-bat-dau-bi-bottom-sheet-che.md)
- ✅ **#140.** ~~`main` không có bản vá #134~~ — **BÁO ĐỘNG GIẢ, lỗi đo của tôi. ĐÃ ĐÓNG
  2026-08-21.** `origin/main` có đủ bản vá #134 lẫn file test của nó (`git show
  origin/main:client/js/room.js | grep -c drawerBreakpoint` → 2; PR #18 MERGED, merge commit
  `8580ae8`). Nguyên nhân: `main` **cục bộ** đứng sau `origin/main` 4 commit và tôi đọc nó mà
  **không `git fetch` trước**. Đã sửa: `main` cục bộ fast-forward về `fd911b0`; checkpoint merge
  `origin/main`→`dev` (chỉ xung đột `?v=` 138 vs 140, giải theo `dev`, **không bump 141** vì
  `git diff` toàn bộ `client/` trước/sau merge là **rỗng** — không byte nội dung nào đổi);
  `npm test` 1204/1204. Đã đính chính câu ghi sai trong hồ sơ #139 bằng một dòng `docs/fix-log.md`
  mới (append-only, không sửa dòng cũ) `[Model: Opus 5]` — [chi
  tiết](docs/todo/B140-main-thieu-ban-va-134.md)
- ✅ **#141.** `e2e/start-modal-non-blocking.spec.ts` **flaky sẵn** (fail cả trên `HEAD` chưa có bản
  sửa #137/#138, trên server mới tinh — không phải hồi quy): nó chờ `waitForURL(/room\.html/)` rồi
  đọc ngay `searchParams.get('id')`, nhưng `?id=` chỉ gắn vào URL **một nhịp sau** ⇒ thua cuộc đua
  thì `roomId` là `null`, người chơi B vào `/room.html?id=` rỗng và bị đá về lobby. **Phần 1 (đua
  `?id=`) đã sửa**: `waitForURL(/room\.html\?id=/)` (dạng `e2e/start-modal-board-centering.spec.ts`
  đang dùng, không flaky) áp cho 13 file cùng mẫu; verify qua server throwaway 3111,
  `start-modal-non-blocking.spec.ts` chromium+firefox 4/4 pass (từng timeout 100%), 12/13 spec khác
  pass riêng lẻ — 1 fail (`security-boundary.spec.ts` `AUTH_REQUIRED`) tái hiện y hệt trên bản trước
  sửa, không liên quan. Kèm theo, **không phải bug sản phẩm** nhưng làm mọi lần chạy e2e khó đọc và
  đã 2 lần gây chẩn đoán nhầm "hồi quy": `authLimiter` 20 req/15 phút/IP (`server/routes/auth.js`) và
  `MAX_ROOMS_PER_IP` mặc định 3 (`server/config.js`). **Phần 2 đã sửa**: người dùng chọn env override
  chỉ cho harness (cùng khuôn `MAX_ROOMS_PER_IP`) — `AUTH_LIMITER_MAX` mới trong `server/config.js`,
  nối vào `authLimiter`; mặc định vẫn 20 khi không set biến, production không đổi. 3 test mới
  `server/tests/auth-limiter-config.test.js`, `npm test` **1230/1230** — [chi
  tiết](docs/todo/B141-e2e-flaky-room-url-race-va-rate-limit.md)
- ✅ **#142.** **(Người dùng khoanh đúng nguyên nhân)** `.panel-right` là grid **rộng cố định**
  339px với `grid-template-columns: 1fr var(--zen-rail-w)`. `1fr` == `minmax(auto, 1fr)`, và cái
  `auto` đó là **min-content của `.panel-players`** — track từ chối co xuống dưới nó. `.slot-card__name`
  mang `white-space: nowrap` nên min-content = **trọn bề rộng tên**; `min-width: 0` (đã có sẵn trên
  `.slot-card`) **không** hạ được min-content nội tại mà grid dùng để size track. ⇒ khi cả 2 ghế có
  người tên dài, cột nội dung phình vượt 339px và **đẩy track rail 56px ra ngoài mép phải**, bị
  `overflow:hidden` cắt. Đây là nguyên nhân của **cả hai** triệu chứng báo nhiều vòng trước: rail
  "dịch sang phải / mất padding", **và** "đường đôi khi collapse" (viền rail lệch khỏi viền shell vài
  px). Đo (1920×995): tên ~13 ký tự → track `326px`, rail tràn **43px**, còn thấy **12.8px** (khớp
  DevTools người dùng `21 × 935`); tên 23 ký tự → track `474px`, tràn **191px**, rail **mất hẳn**.
  **Lý do 4 vòng trước không tái hiện được:** tài khoản khách tên tự sinh ngắn cho min-content 277px
  < track 283px nên không tràn. Sửa: `grid-template-columns: minmax(0, 1fr) var(--zen-rail-w)` —
  ghim sàn về 0 để hình học drawer độc lập với nội dung (đúng thứ tác giả đã làm cho
  `grid-template-rows` ngay dòng dưới); tên cắt ellipsis, rail không bao giờ dịch. Nhánh mobile
  ≤768px không dính (đã có `grid-template-columns: 100%`). 2 test mới
  `e2e/drawer-rail-not-displaced.spec.ts` dùng **tài khoản thật tên 23 ký tự** (bỏ bản sửa ra → 2/2
  fail), `npm test` **1227/1227**, `?v=143→144` `[Model: Opus 5]` — [chi
  tiết](docs/todo/B142-grid-track-1fr-day-rail-ra-khoi-drawer.md)
- ✅ **#143.** Sau #142, ở **ghế của chính mình** nút `✕` (`.slot-card__stand`, `min-width:32px` +
  `gap:6px`) chỉ chừa ~70px cho tên trong thẻ ~117px ⇒ hiển thị `Ngu…`, trong khi ghế đối thủ (không
  có nút) hiển thị `Trần Hoàn…`. Bất đối xứng và ghế của mình lại đọc được ít nhất. Không phải lỗi do
  #142 gây ra — #142 chỉ làm nó lộ đúng bản chất thay vì để layout vỡ. **Vòng 1** (chọn qua
  `AskUserQuestion`): đưa `✕` ra khỏi dòng tên bằng `position: absolute` vào góc trên thẻ — full
  parity (40px→78px) nhưng người dùng xem trực tiếp, phản hồi kiểu **inline cũ đẹp/thu hút mắt
  hơn**, kiểu góc-thẻ mới **làm slot trông rời rạc**. **Vòng 2** (chọn lại qua `AskUserQuestion`):
  quay về inline, **hạ `min-width/min-height` 32px→24px** (sàn WCAG 2.2 AA "target size minimum",
  không phải số tuỳ ý) thay vì giữ nguyên 32px hay revert hoàn toàn. Cải thiện 40px→48px (không full
  parity — đúng tradeoff đã chấp nhận). **Kiểm chứng chạm thật** trên `devices['Pixel 5']`
  (`hasTouch`/`isMobile`, không chỉ đo desktop) — đứng dậy thành công ở 24px. Test
  `e2e/slot-card-stand-inline-touch-target.spec.ts` (viết lại từ bản vòng 1, vì assertion "full
  parity" cũ sẽ luôn sai với quyết định mới): đo 24px + không chồng lấp, cộng kịch bản chạm thật.
  `e2e/drawer-rail-not-displaced.spec.ts` (#142) vẫn 2/2 pass. `npm test` **1230/1230**,
  `?v=144→145→146` — [chi tiết](docs/todo/B143-nut-dung-day-bop-ten-nguoi-choi.md)

### Nguồn: báo cáo trực tiếp người dùng kèm ảnh chụp Android — "Thanh Panel này tốn quá nhiều space, có thể ẩn đi?" (2026-08-22)
- ✅ **#144.** `<nav class="topnav">` cao **60px cố định** trên zen mobile (`--zen-topnav-h`), luôn
  hiện, chứa logo + mã phòng + rời phòng + cài đặt. Trên iPhone SE 375×667 đó là **9% chiều cao
  viewport**. `--zen-topnav-h` là **biến hình học chịu lực** (11 chỗ `calc()` khác trong
  `room-zen.css` + `board.js` đọc gián tiếp qua `shellTop`) — hỏi hướng tương tác qua
  `AskUserQuestion` trước khi code (chọn nút `V`, không phải vuốt — tránh pull-to-refresh không
  kiểm chứng được ở môi trường này). **Đo bắt buộc trước khi kết luận** (server throwaway, không
  đụng DB thật): canvas board **không đổi 1px** khi bật/tắt nav ở CẢ Pixel 5 lẫn iPhone SE 375×667
  (chỉ ~2.6px trên iPhone SE 320×568 đời cũ) — sai giả định ban đầu "iPhone SE lợi thật vì bị giới
  hạn chiều cao"; board rộng-giới hạn (width-bound) trên mọi viewport điện thoại thực tế. Hỏi lại
  người dùng với số đo thật: **giữ làm tính năng gọn giao diện** (đúng yêu cầu gốc), không phải làm
  board to hơn. Cho xem bản nút `V`, người dùng phản hồi **bỏ nút V**, chỉ giữ thanh tối giản
  luôn-nhỏ: rời phòng (trái) + mã phòng (giữa) + cài đặt chung (phải, phát hiện được chèn **động**
  bởi `settings-panel.js` lúc đọc code — **không trùng** `tab-settings` như nhận định ban đầu, đã
  đính chính trong chi tiết), logo bỏ hẳn trên mobile. `--zen-topnav-h: 28px` cố định (bỏ JS toggle),
  `.topnav__right` dùng `order` tường minh dàn 3 nút trái/giữa/phải bất kể thứ tự chèn DOM. Test
  `e2e/topnav-minimal-mobile.spec.ts` (2 viewport, kiểm tra rời phòng **hoạt động thật** không chỉ
  visible), `npm test` **1230/1230**, `?v=147→148→149` `[Model: Sonnet 5]` —
  [chi tiết](docs/todo/B144-an-topnav-tren-mobile-phong-choi.md)

### Nguồn: phân tích HAR `play3cr.dpdns.org_Archive [26-08-22 19-20-59].har` — người dùng hỏi vì sao entry `wss://.../socket.io/` dài nhất, kèm tra cứu chuẩn ngành "Big Site xử lý thế nào?" (2026-08-22)
- ✅ **#145.** Entry WebSocket dài **543 ms** nhưng đó là 3 thứ cộng lại, và phần lớn nhất **không**
  nằm trong entry: **462 ms trôi qua trước khi socket được mở**. `client/index.html:449` nạp
  `index-entry.js` bằng `type="module"` ở cuối `<body>` ⇒ defer ⇒ `io()` chỉ chạy ở **cuối** đồ thị
  module (`index-entry → … → lobby.js:40 new SocketClient()`), dù `_connect()` không cần DOM/CSS/i18n
  — chỉ cần global `io` + một lần đọc `localStorage`. Riêng **220 ms** là phía client sau khi HTML
  đã về (`52.579` → `52.799`). Vì sảnh phụ thuộc **100%** vào socket để có dữ liệu đầu (danh sách
  phòng, `session:me`, online count), ~1005 ms đó là **màn hình trống thật**, không phải tài nguyên
  phụ tải chậm ở nền. Sửa: khởi tạo socket sớm (đưa `socket.io.min.js` + đoạn khởi tạo lên `<head>`,
  `SocketClient` **nhận lại** socket thay vì gọi `io()` lần hai) ⇒ 321 ms TCP+TLS chạy **song song**
  với parse HTML thay vì nối tiếp, ước tính **−200…−250 ms**. Chuẩn ngành xác nhận đây là cách duy
  nhất còn lại: đề xuất WHATWG `preconnect` cho `wss://` đã **closed as not planned**, và
  Figma/Slack đều thiết kế để socket **rời khỏi critical path** (fetch state ban đầu qua HTTP, socket
  chỉ nhận delta). **Đã loại trừ, đừng đi lại:** `preconnect`/`dns-prefetch` (vô ích với `wss`);
  321 ms `connect` (mất gói SYN client↔edge, cùng nguyên nhân #131, không sửa được bằng code);
  RFC 8441/9220 (**đính chính**: trình duyệt CÓ hỗ trợ, CDN thì không — HAR chứng minh: Firefox 153
  xin `HTTP/1.1` Upgrade tới **IP edge khác** dù trang chính chạy HTTP/3). **ĐÃ LÀM 2026-08-22**
  (`fix/socket-early-connect` off `dev`): `socket-early.js` mới chạy trong `<head>` gọi
  `SocketClient.shared()` (static mới, **một chỗ duy nhất** giữ idempotent, `destroy()` nhả slot);
  4 script lên đầu `<head>` **TRÊN mọi `<link rel="stylesheet">`** — script cổ điển đặt sau stylesheet
  sẽ chờ stylesheet đó tải xong, để trôi xuống dưới CSS là trả lại sạch khoản tiết kiệm mà không có
  gì hỏng để nhận ra; gỡ `session.js`/`socket-client.js` khỏi import `index-entry.js` + 2 hint
  `modulepreload` (để lại là nạp file 2 lần = đúng đường #51); `lobby.js` `new` → `shared()`; object
  option `io({...})` **không đụng** ⇒ 8 test #131 pass nguyên. Đo trên 2 instance cô lập (3111/3112,
  DB rỗng riêng, **không** đụng server/DB thật), mốc `navigationStart` → WS opened, median 7 lần:
  **36.9 → 13.8 ms**; FCP **44 → 24 ms** — rủi ro "4 script đồng bộ vào `<head>` phạt first paint"
  tôi nêu ra trước khi đo đã bị chính số đo bác bỏ; đúng **1 kết nối WS/trang**, 0 console error,
  luồng khách→tạo phòng→room→reload→rời phòng giống hệt trên cả 2 instance, không bị đá về login.
  **Localhost nên chỉ chứng minh thứ tự đã đổi, KHÔNG chứng minh biên độ trên domain thật.** 15 test
  mới (mutation trên bản sao ở thư mục tạm: revert 4 file nguồn ⇒ 13/15 fail), cập nhật hằng số import
  `index-entry.js` 7→5 trong test #126, `npm test` **1245/1245**, `?v=149→150`. Phạm vi cố ý chỉ
  `index.html` `[Model: Opus 5]` —
  [chi tiết](docs/todo/B145-socket-mo-qua-muon-trong-doi-trang.md)
- **#146.** `server/middleware/auth.js` `verifySocketToken()` gọi `sessionManager.touchSession()` —
  một lệnh **GHI SQLite đồng bộ** (better-sqlite3, chặn event loop, commit WAL) — **trước** `next()`,
  tức response 101 của **mọi** handshake phải chờ nó xong. Đây là bookkeeping `last_seen` thuần tuý.
  Thành phần `wait: 145 ms` trong HAR. **#81 không phủ mục này**: bench đó chỉ đo đường ĐỌC
  (`getValidSession`), không đo lệnh ghi — đừng dùng #81 để đóng lại lần nữa mà không đo đúng lệnh.
  Chuẩn ngành: auth ở handshake phải rẻ, không chạm datastore (Slack lấy token qua HTTP trước;
  socket.io còn có hẳn `skipMiddlewares` với đúng lý do này). Giá trị thật nằm ở **p99 khi burst** —
  ghi đồng bộ phạt *tất cả* kết nối đang chờ, không riêng kết nối gây ra nó `[Model: Opus 5]` —
  [chi tiết](docs/todo/B146-touchsession-ghi-sqlite-dong-bo-chan-truoc-101.md)
- **#147.** `server/index.js:165` dựng `new Server(server, { cors })` — **chưa bật**
  `connectionStateRecovery`. Mỗi lần rớt transport, người chơi trả giá toàn bộ đường vào lại (321 ms
  TCP+TLS + 145 ms auth + eviction + rejoin) và mất hẳn event xảy ra trong lúc rớt. Đáng cân nhắc vì
  **#131 đã đo được ~17% mất gói** ở hop 8 nhà mạng — đúng môi trường tính năng này sinh ra để phục
  vụ. Chuẩn ngành: Discord có `RESUME` + `resume_gateway_url` + `session_id`, huỷ session sau ~5
  phút, và bắt client **leo thang RESUME → IDENTIFY** khi thất bại lặp; socket.io có tương đương
  (`maxDisconnectionDuration`, khuyến nghị ~2 phút, **không** `Infinity`). **CAO RỦI RO, phải chốt
  với người dùng trước khi code**: đụng thẳng vùng single-device eviction + cờ `auth.reconnect`
  (chỗ đã sinh ra "đăng nhập ở thiết bị khác" giả) và 3 loại grace period mà #115 vừa chỉnh;
  `skipMiddlewares: true` sẽ làm **session đã thu hồi sống lại**, phá đúng cái #68 xây `[Model: Opus 5]` —
  [chi tiết](docs/todo/B147-chua-bat-connectionstaterecovery.md)
- **#148.** `server/socket/SocketHandler.js` middleware chống flood tạo **một `setInterval(1s)` cho
  MỖI socket**; ở quy mô §10 stress test (6000 kết nối) là 6000 timer đánh thức event loop mỗi giây,
  phạt tất cả mọi người vì Node chỉ có một event loop. Cleanup **đúng** (`clearInterval` trong
  `disconnect`) ⇒ không rò rỉ, thuần tuý là chi phí thường trực. Sửa: token bucket **tính lười**
  (`tokens` + `lastRefillMs`, nạp lại theo thời gian trôi ở mỗi `onevent`), không cần timer nào.
  **Ưu tiên thấp** — nợ scale, HAR này (1 kết nối) hoàn toàn không thấy được. Cẩn thận: đây là code
  chống lạm dụng, và `violationStreak`/`FLOOD_DISCONNECT_STREAK` là ngữ nghĩa **theo cửa sổ thời
  gian**, **không** map 1-1 sang token bucket `[Model: Opus 5]` —
  [chi tiết](docs/todo/B148-setinterval-moi-socket-trong-flood-middleware.md)

---

<!-- Khi nhận báo cáo mới: thêm heading "### Nguồn: <tên báo cáo>" dưới đúng
     Phần A hoặc Phần B, tạo file chi tiết mới trong docs/todo/ (giữ định dạng
     số thứ tự + đánh giá hiệu quả/an toàn + trạng thái test như các mục trên),
     rồi thêm 1 dòng index trỏ tới file đó ở đây. -->
