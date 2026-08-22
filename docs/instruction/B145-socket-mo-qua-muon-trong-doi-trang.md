# B145 — Mở socket sớm trong đời trang

## Ranh giới: một instance socket duy nhất, không thương lượng

Đây là rủi ro số một của mục này, và nó **đã từng xảy ra thật**: #51 — `?v=` lệch nhau giữa các
cross-import làm `lobby.js` chạy 2 lần, mở **2 kết nối socket.io** từ cùng một trang, và server
single-device-per-token đá chính người chơi đó ra với thông báo "đăng nhập ở thiết bị khác".

Bản sửa này **cố ý** tách chỗ tạo socket ra khỏi chỗ dùng socket, tức là tự tay tạo ra đúng cái điều
kiện đó. Nên:

- Đoạn khởi tạo sớm phải **idempotent**: nếu đã có socket thì trả lại, không tạo mới.
- `SocketClient._connect()` phải **nhận lại** socket đã có, không được gọi `io()` lần thứ hai.
- Nghiệm thu **không** phải là "trang chạy được". Nghiệm thu là: mở trang thật, đếm số kết nối
  socket.io ở phía server (hoặc số entry `wss://` trong DevTools Network) và khẳng định **đúng 1**.

## `?v=N` — đọc lại quy tắc trong `CLAUDE.md` trước khi commit

Mục này đụng `client/index.html` và `client/js/*.js` ⇒ bắt buộc bump `?v=N` → `?v=N+1` ở **mọi** chỗ,
kể cả các `import '...?v=N'` giữa các module không phải `*-entry.js`. Verify bằng:

```
grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup
```

phải ra **đúng một** giá trị. Đây là lệnh nghiệm thu, không phải eyeball từng file. Chính lỗi bỏ sót
này sinh ra #51 ở trên — tức là ở mục này, một lần bump thiếu vừa gây bug cache vừa tái hiện đúng
bug mà mục này phải tránh.

## Phạm vi: bắt đầu từ `index.html` thôi

`SocketClient` được dùng ở **4 trang** (`lobby.js`, `room.js`, `tournament-detail.js`,
`tournament-match.js`). HAR chỉ đo `index.html`. Làm `index.html` trước, đo, rồi mới nhân rộng —
đừng sửa cả 4 trang trong một lần khi chưa có số liệu chứng minh cách làm đúng.

Lưu ý `room.js` gán vào `window.RoomClient` còn `lobby.js` `export const client` — hai kiểu chia sẻ
khác nhau, đừng giả định chúng đồng nhất.

## Đừng đụng

- **`GvnSession.requireAuth()` / `hasBelievedSession()`**: guard này cố ý **lạc quan** (cookie
  HttpOnly nên client không verify được; handshake mới là kiểm tra thật). Mở socket sớm **không**
  được biến nó thành guard chặt hơn, và cũng không được bỏ nó đi — vẫn phải không mở socket khi
  browser biết chắc là đã đăng xuất.
- **Thứ tự transport + mọi tham số `reconnection*` + `timeout: 12000`**: đã hiệu chỉnh bằng số đo
  thật ở #28/#29 và #131 (retune 8000→12000 vì 8000 nằm trên đỉnh phân bố thành công). **Không đổi
  các giá trị này** như một phần của mục này. Nếu bản sửa vô tình làm chúng khác đi, đó là hồi quy.
- **`cdn-cgi/rum` / Cloudflare Web Analytics**: có nêu trong `docs/todo/B145-*.md` như quan sát phụ.
  Đó **không** thuộc mục này — muốn bỏ thì hỏi người dùng riêng (số liệu đó có thể đang được dùng).

## Đo (bắt buộc, đừng suy từ code)

Lặp lại phương pháp đã dùng ở #131: **instance cô lập** — copy repo + DB tạm + cổng riêng, **không**
đụng DB/server thật đang có người chơi (`playwright-e2e-safety`).

Cần con số cho **cùng một mốc** trước/sau: khoảng cách từ `navigationStart` tới lúc socket `connect`.
Đừng chỉ báo cáo `entry.time` của WebSocket — 543 ms trong HAR gốc **không** phải thứ mục này làm
giảm; thứ giảm là 462 ms chờ trước đó. Báo cáo nhầm mốc sẽ trông như bản sửa không có tác dụng.

Chú ý khi đo: HAR Firefox không ghi WS frame; DevTools Chrome thì có. Và trên máy dev không qua
Cloudflare thì `connect` sẽ ~0 ms — **con số cải thiện chỉ có ý nghĩa khi đo qua domain thật**, đúng
bài học "verify against production-shaped conditions" trong `CLAUDE.md`.

## Test

`client/tests/` **có** hạ tầng jsdom thật (9+ file, chạy trong `npm test`) — #131 đã ghi lại bài học
này sau khi khẳng định nhầm rằng client không có test. Kiểm `ls client/tests/` trước, rồi viết test
thật. Tối thiểu: khởi tạo sớm rồi dựng `SocketClient` ⇒ **`io()` được gọi đúng 1 lần**.

Kiểm chứng test không rỗng: bỏ bản sửa ra thì test phải fail.
