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

## "Đừng làm" — reviewer chỉ rõ ranh giới không nên đụng

- **Đừng chuyển `game:moved` sang delta** — đã là delta tối ưu (121 B/nước,
  ngang mức tối ưu của dự án cùng bài toán). Không có việc gì để làm ở đây.
- **Đừng đụng `client/js/socket-client.js:40`** — cách chọn `ws://`/`wss://`
  theo origin đã đúng, sửa vào đây có thể tạo lại đúng lỗi TLS đang tránh.
- **Đừng nới rate limiter trong code production chỉ để tự test được** (xem quy
  tắc chung #0) — nếu cần test hơn 20 "người dùng", restart server giữa các đợt
  thay vì đổi ngưỡng.
- **Đừng sửa file gốc để chạy mutation test** — luôn copy sang thư mục tạm.
