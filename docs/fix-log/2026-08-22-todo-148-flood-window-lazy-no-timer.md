# TODO.md #148 — bỏ `setInterval(1s)` mỗi socket trong middleware chống flood

**Thời điểm:** 2026-08-22
**Nhánh:** `fix/flood-window-lazy-no-timer` (off `dev` — mục #148 chỉ có trên `dev`, chưa có trên
`main`, theo ngoại lệ của `git-workflow` skill)
**File:** `server/socket/SocketHandler.js`, `server/tests/flood-protection.test.js`

## Vấn đề

Middleware chống flood tạo **một `setInterval(1s)` cho mỗi socket** để đóng cửa sổ đếm 1 giây. Ở
6000 kết nối (quy mô stress test §10) là 6000 timer đánh thức event loop mỗi giây, dù socket đang im.
Cleanup đúng (`clearInterval` trong `disconnect`) ⇒ không rò rỉ, thuần tuý là chi phí thường trực.

## Cách sửa: cuộn cửa sổ **tính lười**, không dùng token bucket thuần

Giữ **nguyên** mô hình cửa sổ 1 giây rời rạc — **không** chuyển sang token bucket thuần, vì tầng 2
(`violationStreak`) là ngữ nghĩa theo cửa sổ và token bucket không có khái niệm đó (đúng cảnh báo
trong `docs/instruction/B148-*.md`). Thay vào đó chỉ dời **thời điểm tính** biên cửa sổ: `rollWindows(now)`
chạy ở đầu mỗi `onevent`, đóng mọi biên đã trôi qua kể từ event trước rồi mở cửa sổ hiện tại.
`windowStart` tiến theo bội số nguyên của 1000 ms nên cửa sổ vẫn nằm đúng trên lưới 1 giây cũ, không
"khởi động lại" tại `now`.

Cả hai tầng giữ nguyên: chặn mềm (nuốt event + `RATE_LIMITED` **đúng 1 lần/cửa sổ** qua
`warnedThisWindow`) và ngắt cứng sau `FLOOD_DISCONNECT_STREAK` cửa sổ vượt ngưỡng liên tiếp.
`MAX_EVENTS_PER_SECOND` / `FLOOD_DISCONNECT_STREAK` **không đổi**.

### Định nghĩa tương đương (viết ra rõ, theo yêu cầu của instruction)

Một biên cửa sổ chỉ có thể thay đổi trạng thái nếu cửa sổ đó **có event**. Cửa sổ mà socket im lặng
luôn có `eventCount = 0 ≤ MAX` ⇒ phán quyết luôn là "sạch, reset streak" — giống hệt nhau dù tính ở
biên hay tính lúc event kế tiếp tới. Vì vậy `rollWindows` chỉ cần: (1) chấm điểm cửa sổ gần nhất có
ghi nhận event, (2) nếu `elapsed > 1` thì mọi cửa sổ ở giữa là im lặng ⇒ `violationStreak = 0`.

**Một khác biệt hành vi duy nhất, cố ý:** socket flood đủ streak rồi im **vĩnh viễn** sẽ bị ngắt ở
event kế tiếp thay vì ở biên cửa sổ. Trong lúc im nó không tốn gì, và mọi event vượt ngưỡng nó đã gửi
đều **đã bị nuốt** — không có hành vi lạm dụng nào lọt qua khe đó. Nếu nó gửi lại, event đầu tiên
kích hoạt `rollWindows`, bị ngắt, và event đó **không** được giao xuống (`return` trước `origEmit`).

## Đo — kết quả thật, và nó **không** ủng hộ lý do "hiệu năng"

Không dựng tải 6000 socket thật; thay vào đó đo **đúng cơ chế bị gỡ** (N timer 1s rỗng, không I/O),
trên máy dev, Node 24:

| N timer 1s rỗng | event-loop delay mean | p99 | CPU / giây tường |
|---|---|---|---|
| 0 | 1.088 ms | 1.234 ms | 1.26 ms |
| 1000 | 1.088 ms | 1.235 ms | 2.85 ms |
| 6000 | 1.089 ms | 1.233 ms | 0.84 ms |

Số CPU **không đơn điệu** (6000 timer rẻ hơn 0 timer) ⇒ chi phí nằm **dưới ngưỡng nhiễu** của phép
đo. Lý do kỹ thuật: Node gom timer **cùng thời lượng** vào một danh sách liên kết theo duration, nên
6000 timer 1000 ms là **một** danh sách quét mỗi giây, không phải 6000 thao tác heap — tiền đề
"6000 timer đánh thức event loop 6000 lần/giây" trong mục #148 là **sai**.

Chi phí duy nhất đo được là bộ nhớ: **286 B/socket**, tức **+1.64 MiB** heap ở 6000 kết nối
(`node --expose-gc`, đo quanh `global.gc()`).

**Kết luận trung thực:** lợi ích hiệu năng của thay đổi này là **không đo được** ở quy mô §10; lợi
ích thật là bộ nhớ nhỏ + ít trạng thái sống hơn mỗi kết nối + bớt một chỗ có thể quên `clearInterval`.
Không viết con số nào vào code.

## Test

`server/tests/flood-protection.test.js` mở rộng 8 → **20** case, phủ theo bảng quyết định + giá trị
biên như `CLAUDE.md` yêu cầu:

- Biên `MAX_EVENTS_PER_SECOND` tham số hoá: dưới 1 / đúng ngưỡng / trên 1 → số event giao + số cảnh báo.
- `RATE_LIMITED` đúng 1 lần mỗi cửa sổ; cửa sổ mới cho phép cảnh báo mới.
- Cửa sổ **không** cuộn sớm 1 ms (`advanceTimersByTime(999)`).
- Đủ streak ⇒ ngắt; **thiếu 1** ⇒ không ngắt; event kích hoạt ngắt **không** được giao xuống.
- Ngoan lại một cửa sổ ⇒ streak reset; **cửa sổ im lặng ở giữa cũng phá streak** (đường riêng của
  bản lười, `elapsed > 1`).
- Trạng thái cửa sổ **không** chia sẻ giữa các kết nối (flooder bị ngắt, socket ngoan không nhận
  cảnh báo nào).
- Không kết nối nào để lại timer (`jest.getTimerCount()` không tăng sau 10 socket) — thay cho test
  `clearInterval` cũ, giữ đúng ý định "disconnect ⇒ không còn tài nguyên sống".
- `packet` tới `origEmit` **nguyên vẹn** và `this` đúng là socket — bảo vệ lớp bọc `socket.on` /
  `RAW_PAYLOAD_EVENTS` ở chỗ khác trong cùng file khỏi vỡ ngầm.

`npm test`: **1256/1256** xanh (64 suite).

## Không đụng

`MAX_EVENTS_PER_SECOND`, `FLOOD_DISCONNECT_STREAK` (`server/config.js`) — mục này đổi **cơ chế đếm**,
không đổi **ngưỡng**. Không đụng `client/` ⇒ **không** bump `?v=N`.
