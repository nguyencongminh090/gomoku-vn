# #131 — `timeout` mặc định 20 s của socket.io-client quá lâu khi lần kết nối đầu bị mất gói

**Trạng thái:** chưa làm.

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
- **Test:** `client/js/` hiện **không có hạ tầng test tự động** trong repo này, nên không viết được
  unit test cho thay đổi này — phải xác minh bằng trình duyệt thật (xem file instruction).
