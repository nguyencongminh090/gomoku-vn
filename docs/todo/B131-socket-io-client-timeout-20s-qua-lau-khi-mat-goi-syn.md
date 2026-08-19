# #131 — `timeout` mặc định 20 s của socket.io-client quá lâu khi lần kết nối đầu bị mất gói

**Trạng thái:** ✅ Đã sửa — **ĐÃ LÀM 2026-08-19** (`fix/socket-io-connect-timeout` off `dev`).

**Retune 2026-08-19 22:04: `8000` → `12000`** sau khi đo phân bố thật (xem cuối mục). Thêm `timeout` vào `io({...})` trong `client/js/socket-client.js` (đúng 1 dòng cấu hình + comment
dẫn số đo), giữ nguyên thứ tự transport websocket-first và mọi tham số `reconnection*`. `?v=130→131`
trên 17 file, grep còn đúng 1 giá trị.

- **8 test mới** `client/tests/socket-client-connect-options.test.js`; `npm test` **1193/1193**
  (trước: 1185). Đã kiểm chứng test không rỗng: bỏ bản sửa ra thì **4/8 fail**.
- **Đo được cả đường thất bại** trên instance cô lập (copy repo + DB tạm + cổng 3111, không đụng
  DB/server thật đang có người chơi), mô phỏng đúng kiểu WS#1 trong HAR bằng `ctx.routeWebSocket`
  nuốt handshake: **20 120 ms → 8 122 ms**, tiết kiệm **~12,0 giây**.
- Luồng thật guest → tạo phòng → `room.html`: connect **839 ms**, `io._timeout = 8000` (socket.io
  thật sự nhận option), transport `websocket`, banner không kẹt, **0 console error**.
- Chi tiết: [fix-log](../fix-log/2026-08-19-todo-131-socket-io-connect-timeout.md).

**Nguồn:** cùng phân tích HAR với #130 (`play3cr.dpdns.org_Archive [26-08-19 20-49-17].har`,
`room.html?id=#JGY`, 2026-08-19 20:47:48 +07). Đây là phần **duy nhất** cải thiện được bằng code
trong báo cáo đó — nguyên nhân gốc là mất gói SYN ở chặng trình duyệt ↔ Cloudflare edge, ngoài tầm
kiểm soát của server (#130 từng bị nghi là nguyên nhân nhưng đã bị log bác bỏ). Mục này chỉ giảm
thiệt hại.

## Vấn đề

`client/js/socket-client.js` (`this.socket = io({...})`) **không đặt `timeout`**, nên dùng mặc định
**20 000 ms** của socket.io-client. Trong HAR:

```
WS#1  20:47:48.873  blocked=44616  connect=7196  → bị huỷ lúc ~20:48:08.9 (hết timeout 20s)
WS#2  20:48:09.850  connect=1083  ssl=418  wait=1388  → thành công sau 2.9s
```

Lần thử lại chỉ mất **2.9 s**, nhưng người chơi phải chờ **20 s** trước khi nó bắt đầu. Tổng cộng
~24 s đứng ở banner "Đang kết nối…". Với chặng client↔edge hay mất gói SYN, tình huống "lần thử
đầu chết, lần thử hai thành công nhanh" là kịch bản thường gặp chứ không phải ngoại lệ.

## Việc cần làm

Đặt `timeout: 8000` trong object cấu hình `io({...})` ở `client/js/socket-client.js`.

Vì sao 8000: handshake bình thường qua tunnel đo được ~2.9 s ở lần xấu và ~0.2 s ở lần tốt
(`room.html` `wait=149ms` cho thấy đường HTTP tới origin ~150 ms), nên 8 s vẫn dư gấp ~2.7 lần lần
handshake chậm nhất quan sát được — không tạo ra huỷ nhầm — mà cắt thời gian chờ vô ích từ 20 s
xuống 8 s.

**Bắt buộc kèm theo:** bump `?v=130` → `?v=131` ở **mọi** chỗ theo quy tắc cache-busting của
`CLAUDE.md` (cả `client/*.html` lẫn mọi `import '...?v=N'` trong `client/js/*.js`), verify bằng
`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` phải ra đúng **một** giá trị.

## Điểm cần theo dõi (chưa phải lỗi đã xác nhận — đừng "sửa" mù)

WS#1 vẫn được edge accept lúc `20:48:40`, tức **28 s sau khi WS#2 đã online**. Về lý thuyết
socket.io đã gọi `engine.close()` khi hết timeout nên connection này chết ngay khi mở; và nếu nó có
tới được server thì nó mang `auth.reconnect=true` (đặt trong listener `reconnect_attempt` ở
`socket-client.js`) nên `SocketHandler.js:123` sẽ bỏ qua `session:kicked`. **Chưa thấy bằng chứng
lỗi thật.** Nhưng đây đúng là cơ chế từng sinh ra false "đăng nhập ở thiết bị khác" — nếu người
chơi báo bị đá khỏi phòng lúc mạng chậm, quay lại điểm này trước.

Giảm `timeout` xuống 8 s cũng **thu hẹp** cửa sổ này (8 s thay vì 20 s), là lợi ích phụ.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Hiệu quả:** cắt tối đa 12 s thời gian chờ mỗi lần kết nối đầu thất bại. Không giúp gì khi mạng
  tốt (lần đầu đã thành công).
- **An toàn:** thấp rủi ro — 1 dòng cấu hình client. Rủi ro duy nhất: nếu có người chơi ở mạng thật
  sự tệ hơn mẫu đo (handshake > 8 s), họ sẽ retry sớm hơn thay vì chờ — vẫn đúng hành vi mong muốn
  vì `reconnectionAttempts: Infinity` đã bật sẵn.
- **Test:** ~~`client/js/` không có hạ tầng test tự động~~ — **tuyên bố này SAI**, viết lúc ghi
  tracking mà chưa kiểm tra. `client/tests/` đã tồn tại sẵn với 9 file jsdom test chạy trong
  `npm test`. Đã viết test thật (8 case) thay vì bỏ qua. Ghi lại đây làm bài học: kiểm `ls
  client/tests/` trước khi kết luận một tầng "không có test".

## Retune 2026-08-19 22:04 — `8000` → `12000`

Người dùng dán console log có 2 cặp `Firefox can't establish a connection to … wss://…`. Đo lại từ
máy chủ mới lộ ra rằng **giá trị 8000 là sai**, không chỉ chưa tối ưu:

- `mtr -n -r -c 30 1.1.1.1`: hop 1-5 (router nhà, modem, mạng truy nhập ISP) **0% loss**; từ hop 8
  (`10.255.10.25`) trở đi **16.7% loss** liên tục. Ping router 0% / 1.5 ms, Wi-Fi −56 dBm ⇒ **không
  phải Wi-Fi, không phải tunnel, không phải code** — mất gói nằm trong mạng nhà mạng.
- `curl -w %{time_connect}` tới Google/GitHub/Cloudflare/site: 45 ms **hoặc** 3.1 / 4.1 / 5.2 / 7.6 /
  11.7 s, với **mọi** đích ⇒ bậc thang SYN retransmit.
- 12 lần bắt tay WebSocket qua Cloudflare: 1921 … 7948 ms, median **5074 ms**, max thành công
  **7948 ms**.

⇒ 8000 (hiệu chỉnh trên **một** mẫu HAR 2.9 s) nằm đúng trên đỉnh phân bố thành công. 12000 vượt hẳn
bậc 7 s kể cả jitter, vẫn bỏ cuộc trước bậc 15 s.

Cũng phát hiện **biên test cũ rỗng một nửa**: `expect(timeout).toBeGreaterThan(7948)` vẫn cho 8000
lọt (thừa đúng 52 ms) — tức test không bắt được chính lỗi vừa sửa. Đã nâng lên `>10000`.

Đo lại đường thất bại: **12 115 ms** (8000 → 8122 ms; mặc định → 20 120 ms). Luồng bình thường
connect **767 ms**, `io._timeout = 12000`, 0 console error. `?v=131→132`.
[fix-log](../fix-log/2026-08-19-todo-131-retune-timeout-12s.md)