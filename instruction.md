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

### A1. TLS/HTTPS (review 3.0)

- Caddy là lựa chọn rẻ nhất — tự xin và tự gia hạn Let's Encrypt, app không cần
  biết gì về chứng chỉ, vẫn nói HTTP trần ở cổng nội bộ.
- **Bắt buộc đi kèm:** `app.set('trust proxy', 'loopback');` (hoặc đúng số hop
  thật) trong `server/index.js`. Thiếu dòng này → `express-rate-limit` gộp mọi
  người dùng vào chung IP proxy, khoá nhầm người thật thay vì kẻ tấn công. Set
  **quá rộng** → `X-Forwarded-For` giả mạo được, bypass rate limit — phải set
  đúng số hop, không phải set rộng cho chắc.
- **Không được đụng vào:** `client/js/socket-client.js:40` gọi `io({...})`
  không truyền URL — socket.io tự chọn `wss://`/`ws://` theo origin trang, đây
  đã đúng sẵn. Không hardcode `ws://` ở đây.
- **Nếu dùng Caddy:** block `handle /socket.io*` phải đặt **trước** block
  catch-all, nếu không catch-all nuốt mất đường socket — lỗi hay gặp khi dựng
  lần đầu.

### A4. Đo lại timing attack sau khi áp Phần B #6

Sau khi thêm dummy-compare (Phần B #6), phải đo lại **thời gian phản hồi thật**
(không chỉ tính đối xứng code path) trên máy có bcrypt hoạt động được — máy
đánh giá gốc không load được bcrypt nên chưa có số đo trước/sau để so sánh.

---

## Phần B (sửa bằng code) — hướng dẫn cho từng mục

### B1. Restart-hang else branch (review 5.1)

- Chỉ cần emit `room:destroyed`/`room:left` trong nhánh else — reviewer không
  yêu cầu logic phức tạp hơn (không cần lưu state phòng ra đĩa, không cần giữ
  ván qua restart — đó là thay đổi kiến trúc lớn hơn nhiều, ngoài phạm vi việc
  này).

### B2. Chat sanitize (review 3.5)

- Sửa: **escape thực thể** (`&lt;`, `&gt;`), không phải thêm rule regex khác để
  bắt thẻ không đóng — reviewer đánh giá cách vá đúng là đổi hẳn chiến lược
  (escape) chứ không phải vá thêm cho quy tắc "strip" cũ.
- Đây là phòng thủ chiều sâu — reviewer xác nhận **không có XSS đang mở** hôm
  nay (consumer dùng `textContent`). Không cần coi đây là khẩn cấp.

### B3. `escapeAttr` (review 3.7)

- Hiện **an toàn** vì input chỉ là `roomId`/`userId` do server sinh. Sửa vì
  phòng ngừa tương lai — reviewer cảnh báo cụ thể: nếu sau này ai tái dùng hàm
  này cho `roomName`/`displayName` (dữ liệu người dùng nhập) mà chưa sửa, lỗ
  hổng mới thành thật. Không cần gấp nhưng nên sửa trước khi `escapeAttr` được
  dùng cho input tự do.

### B4. `SELECT *` + rate limit `/api/games` (review 6.4)

- Không có hướng dẫn chi tiết thêm từ reviewer ngoài mô tả lỗi — 2 việc độc
  lập, có thể làm riêng.

### B6. Timing attack — dummy compare (review 3.6)

- Sửa: "luôn `compare` với một hash dummy **cố định**" — chú ý chữ "cố định":
  không tính dummy hash động (vd. hash rỗng runtime), phải là 1 hằng số
  hardcode, nếu không phép so sánh dummy có thể có timing khác biệt tuỳ theo
  cách sinh ra.
- Xem A4 — phải đo lại sau khi sửa.

### B7. Room quota theo IP/tài khoản (review 3.2)

- Reviewer đề 2 hướng, chọn 1: **(a)** hạn mức phòng theo IP/tài khoản, hoặc
  **(b)** cấm hẳn guest tạo phòng (chỉ cho join phòng có sẵn). Không bắt buộc
  làm cả hai.

### B8. Bỏ `settings` khỏi `room:updated` (review 4.2)

- Có **17 điểm emit** `room:updated` được reviewer liệt kê theo review 4.1 (số
  điểm gọi `broadcastLobbyUpdate` liên quan) — khi sửa, đối chiếu đủ danh sách
  gốc trong `issue report.md` mục 4.1/4.2, không chỉ sửa những chỗ tình cờ gặp
  khi grep.
- Xa hơn (không bắt buộc trong lượt sửa rẻ): delta kiểu "user X đổi slot" thay
  vì chỉ bỏ settings — reviewer liệt kê đây là bước xa hơn, không phải yêu cầu
  bắt buộc của "thắng nhanh nhất".

### B9. `lobby:update` → delta (review 4.1/13 + báo cáo kiểm chứng `3da53dd`)

- Review gốc: "debounce 200-500ms là thắng nhanh nhất... Xa hơn là gửi delta 1
  phòng + `roomId`" — tức reviewer **coi debounce là bước tạm, không phải bước
  cuối.**
- **Báo cáo kiểm chứng đã đo lại và phát hiện debounce 300ms KHÔNG đạt mục tiêu**
  ở nhịp người chơi thật (~1200ms giữa hành động) — vẫn ra đúng 4 gói/10 759B
  như trước khi có debounce. Reviewer đề xuất cụ thể: **nâng cửa sổ lên 1-2
  giây** như một bản vá rẻ tạm thời, hoặc **làm nốt phần delta** — khi đó cửa
  sổ bao nhiêu không còn quan trọng. Không coi debounce 300ms hiện tại là "đã
  xong việc này".

### B10. `timer:tick` → `deadline` (review 4.3)

- Sửa: gửi `{deadline}` **1 lần/lượt**, client tự đếm ngược — reviewer không
  yêu cầu gửi kèm thời gian server để đồng bộ đồng hồ (đó là rủi ro agent tự
  thêm vào khi đánh giá an toàn, xem `TODO.md` B10, không phải yêu cầu gốc của
  reviewer — nhưng nên cân nhắc vì review không đo case lệch giờ client).

### B11. Viết lại test đã bị xoá cho 6 fix (phát hiện từ báo cáo kiểm chứng)

- Reviewer chỉ rõ: *"các test đó đã viết rồi - chỉ cần giữ lại thay vì xoá"* —
  nghĩa là khi làm lại, tra đúng mô tả "Bằng chứng" của từng fix trong
  `docs/fix-log.md` để tái tạo đúng kịch bản test đã chạy qua (không cần thiết
  kế lại từ đầu), rồi giữ trong `server/tests/` vĩnh viễn.
- 6 fix cần test: #2 (isGuest thật), #3 (`!noScore`), #4 (không resume khi đối
  thủ còn grace), #6 (chặn kick khi `interrupted`), #7 (flood: 1 warning/cửa sổ
  + disconnect khi tái phạm), #12 (debounce lobby).

### B12. Thứ tự trong `cancelDisconnectGrace` (phát hiện từ báo cáo kiểm chứng)

- Sửa: dời `disconnectTimers.delete()` xuống **sau** khi kiểm tra membership
  (dòng 181), không phải xoá logic delete — chỉ đổi thứ tự 2 khối code đã có
  sẵn.
- Reviewer ghi rõ đây là **latent bug, chưa khai thác được** (kick đã bị chặn
  khi `interrupted` bởi fix #6) — không cần coi là khẩn cấp, nhưng nên sửa dứt
  điểm vì rẻ.

---

## "Đừng làm" — reviewer chỉ rõ ranh giới không nên đụng

- **Đừng chuyển `game:moved` sang delta** — đã là delta tối ưu (121 B/nước,
  ngang mức tối ưu của dự án cùng bài toán). Không có việc gì để làm ở đây.
- **Đừng đụng `client/js/socket-client.js:40`** — cách chọn `ws://`/`wss://`
  theo origin đã đúng, sửa vào đây có thể tạo lại đúng lỗi TLS đang tránh.
- **Đừng nới rate limiter trong code production chỉ để tự test được** (xem quy
  tắc chung #0) — nếu cần test hơn 20 "người dùng", restart server giữa các đợt
  thay vì đổi ngưỡng.
- **Đừng sửa file gốc để chạy mutation test** — luôn copy sang thư mục tạm.
