# B148 — Thay timer-per-socket bằng token bucket tính lười

## Đây là code chống lạm dụng, không phải code tiện ích

Sửa sai thì hoặc mở cửa cho flood, hoặc ngắt nhầm người chơi bình thường. Đo được vài phần trăm CPU
không đáng đổi lấy một trong hai. Nếu không giữ được hành vi tương đương thì **đừng làm** — nợ scale
này chưa gây thiệt hại nào quan sát được.

## Ngữ nghĩa phải giữ nguyên (đọc kỹ, nó không map 1-1 sang token bucket)

Logic hiện tại có **hai** tầng, đừng gộp:

1. **Chặn mềm trong cửa sổ**: `eventCount > MAX_EVENTS_PER_SECOND` ⇒ **nuốt** event (không gọi
   `origEmit`) và gửi `room:error` code `RATE_LIMITED` **đúng một lần mỗi cửa sổ**
   (`warnedThisWindow`). Người chơi bị chặn nhưng **không** bị ngắt.
2. **Ngắt cứng theo streak**: nếu cửa sổ nào cũng vượt ngưỡng liên tiếp đủ
   `FLOOD_DISCONNECT_STREAK` lần ⇒ `socket.disconnect(true)`. Ngoan lại một cửa sổ ⇒
   `violationStreak = 0`.

Tầng 2 là **theo cửa sổ thời gian rời rạc**, không phải theo token. Token bucket thuần không tự có
khái niệm "streak" — phải giữ một biến cửa sổ riêng, hoặc định nghĩa lại streak theo cách chứng minh
được là tương đương. **Viết ra định nghĩa tương đương đó trong PR/summary**, đừng để nó ngầm.

`warnedThisWindow` cũng cần một mốc cửa sổ để reset — nếu không, token bucket sẽ bắn `RATE_LIMITED`
mỗi event bị chặn, biến một cảnh báo thành chính cái flood nó đang chống.

## Bẫy: `socket.onevent` đang bị ghi đè, đừng phá chuỗi

Middleware này thay `socket.onevent` bằng wrapper gọi `origEmit.call(this, packet)`. `SocketHandler`
**cũng** bọc `socket.on` ở chỗ khác (bảo vệ throw + ép payload thành object, có `RAW_PAYLOAD_EVENTS`
miễn trừ cho `disconnect`). Hai lớp bọc này độc lập nhưng chồng lên nhau — sửa lớp này mà làm hỏng
`this` hoặc thứ tự gọi sẽ vỡ lớp kia theo cách khó truy.

## Đừng đụng

- **`MAX_EVENTS_PER_SECOND` và `FLOOD_DISCONNECT_STREAK`** trong `server/config.js`. Mục này đổi
  **cơ chế đếm**, không đổi **ngưỡng**. Đổi ngưỡng là quyết định về sản phẩm, phải hỏi.
- **`clearInterval` trong `disconnect`**: nếu chọn phương án "một interval dùng chung", nhớ rằng chỗ
  cleanup phải chuyển thành xoá khỏi `Set`. Quên là rò rỉ — hiện tại **không** rò, đừng biến một
  mục tối ưu thành một bug rò rỉ.

## Đo — nếu không đo được thì đừng viết con số vào code

Ở 1 kết nối, mục này cho lợi ích **bằng 0**. Muốn khẳng định lợi ích thì phải dựng tải thật: đã có
sẵn `server/tests/test-load.js` và `docs/stress-test-report.md` §10 làm khuôn mẫu (§10 chạy tới 6000
kết nối). Chạy trên **instance cô lập**, không đụng DB/server thật.

Nếu không dựng được phép đo, hãy nói thẳng điều đó trong summary và mô tả lợi ích là **định tính**
— đừng bịa số. Đây đúng loại mục dễ bị "tối ưu" bằng niềm tin.

## Test (bắt buộc — `server/tests/` có hạ tầng thật)

Theo mục "Writing comprehensive test cases" của `CLAUDE.md` — đây là logic có ngưỡng, nên **bảng
quyết định + phân tích giá trị biên** là bắt buộc, không phải một happy path:

- Đúng ngưỡng / dưới ngưỡng 1 / trên ngưỡng 1 (biên `MAX_EVENTS_PER_SECOND`).
- Vượt ngưỡng ⇒ event bị nuốt **và** `RATE_LIMITED` gửi **đúng 1 lần** trong cửa sổ đó.
- Vi phạm liên tiếp đủ `FLOOD_DISCONNECT_STREAK` ⇒ ngắt; thiếu 1 ⇒ **không** ngắt.
- Vi phạm rồi ngoan lại ⇒ streak reset về 0 (đường dễ mất nhất khi chuyển sang token bucket).
- `disconnect` ⇒ không còn tài nguyên nào còn sống (timer hoặc entry trong `Set`).

Dùng fake timer, và **assert trạng thái thật**, không chỉ "không ném lỗi".
