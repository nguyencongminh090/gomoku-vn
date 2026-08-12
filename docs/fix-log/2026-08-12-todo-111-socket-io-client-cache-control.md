# Fix log entry — 2026-08-12 08:44

## Prompt

> Proceed TODO task. Do it follow priority

Mục thứ hai theo thứ tự ưu tiên đã chốt (#105 → **#111** → #109 → #110).

## Action

Đọc `docs/instruction/B111-*.md` trước khi làm. **Kiểm chứng giả định của chính instruction đó
trước khi viết code — và cả hai hướng nó đề xuất đều sai:**

1. **"Chèn route Express ghi đè header"** — bất khả thi. engine.io `attach()` gọi
   `removeAllListeners('request')` trên HTTP server rồi cài listener riêng: URL khớp prefix
   `/socket.io/` thì nó tự xử lý, không khớp mới gọi lại listener cũ (Express). Probe: middleware
   Express đặt `X-Express-Saw` → response **không** có header đó, cờ vẫn `false`.
2. **"Tắt `serveClient` rồi `express.static` dưới `/socket.io`"** — cũng bất khả thi: với
   `serveClient: false`, engine.io vẫn nuốt `/socket.io/*` và trả **400 / 40 byte**, không rơi
   xuống `express.static`.
3. `Cache-Control: public, max-age=0` là **hardcode** ở `socket.io/dist/index.js:360` — không có
   option nào chỉnh được.

Nên hướng khả thi duy nhất là phục vụ file ở path **ngoài** `/socket.io/`:

- `server/config/staticCache.js`: thêm export **riêng** `SOCKET_IO_CLIENT` (`public, max-age=86400`)
  + `socketIoClientOptions`. **Không** sửa `setStaticCacheHeaders()` — instruction cấm nhét ngoại lệ
  vào đó, và 17 test của #106 đang bám ngữ nghĩa "chỉ cho asset `client/`". Một export mới không
  đổi ngữ nghĩa cũ nên vẫn đúng tinh thần điều cấm.
- `server/index.js`: `app.use('/vendor/socket.io', express.static(<socket.io/client-dist>,
  socketIoClientOptions))`, đặt trước `express.static(clientPath)`. Đường dẫn resolve qua
  `require.resolve('socket.io/package.json')` vì `./client-dist` **không** nằm trong `exports` của
  package (resolve thẳng vào file ném `ERR_PACKAGE_PATH_NOT_EXPORTED`).
- 4 file HTML → `src="/vendor/socket.io/socket.io.min.js"`.

## Decision

**Đây là deviation so với instruction, ghi rõ theo quy tắc CLAUDE.md.** Phạm vi rộng hơn dự kiến
(phải đổi URL ở 4 file HTML thay vì chỉ chỉnh một header), nhưng vẫn đúng mục tiêu của #111 và
không đụng gì ngoài đó. Instruction sẽ được người sau đọc kèm mục "Trạng thái" trong
`docs/todo/B111-*.md`, nơi đã ghi lại vì sao 2 hướng cũ bị bác bỏ.

**Giữ `serveClient` BẬT (không tắt).** Instruction cảnh báo "đừng tắt mà quên route thay thế →
hỏng toàn site". Giữ bật thì URL cũ vẫn phục vụ được, nên HTML còn cache hoặc `dist/` cũ (#109 —
`dist/` vẫn kẹt ở 08-08 và vẫn trỏ URL cũ) chỉ tụt về hành vi cũ chứ không mất global `io`. Đổi
lại là còn một route dư; chấp nhận, và đã ghi comment giải thích ngay tại chỗ.

**`max-age=86400`, KHÔNG `immutable`** — đúng khuyến nghị an toàn của instruction: URL không có
`?v=N`, nội dung đổi khi `npm update socket.io`, `immutable` sẽ ghim client cũ tới 1 năm và hỏng
kiểu "kết nối được nhưng vài event im lặng không chạy". 1 ngày xoá được round-trip mỗi-lần-tải mà
lệch phiên bản vẫn tự lành trong 24h.

**Không bump `?v=N`**: chỉ sửa `client/*.html`, không đụng `client/css/`|`client/js/` — cùng lý do
đã ghi ở fix-log #107. `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` vẫn ra đúng
một giá trị `?v=104`.

## Summary output

`npm test`: **1114/1114 xanh** (trước 1101, +13). Test mới pin cả ràng buộc "engine.io chiếm
`/socket.io/`" và "URL cũ vẫn 200 với `max-age=0`", để lần sau không ai 'dọn dẹp' thành hỏng.

Xác minh bằng **Chromium thật** (server tạm cổng 3001; DB thật dời sang bên rồi khôi phục,
`md5sum -c` **OK**, còn nguyên 12 users / 64 games; không còn tiến trình server nào của phiên này):

- `/vendor/socket.io/socket.io.min.js` → `200 public, max-age=86400`; **0 lỗi console**.
- WebSocket mở thật; `#online-panel-count` = **1** → có round-trip server→client thật.
- **Lần vào lại: 25/25 resource `transferSize === 0`, 0 byte qua mạng**, gồm cả `socket.io.min.js`.
  Trước fix, file này là request duy nhất (ngoài `index.html`) còn phải hỏi lại origin mỗi lần tải.

**Một pha suýt kết luận sai, ghi lại để lần sau khỏi vấp:** lần đo đầu `#online-panel-count` ra
`0`, dễ đọc thành "fix làm hỏng socket". Thực ra `.env` đặt `CORS_ORIGIN=https://play3cr.dpdns.org`
còn test chạy qua `localhost:3001` — chạy lại với `CORS_ORIGIN` khớp thì ra `1`. Không phải hồi quy.
Tương tự, `page.on('request')` của Playwright **vẫn bắn cho cả resource lấy từ cache**, nên lần đo
"vẫn tải lại socket.io.min.js" là giả — phải dùng `performance.getEntriesByType('resource')` và
`transferSize` mới là số thật.

**Ngoài phạm vi, chưa xử lý:** server thật vẫn tắt, `https://play3cr.dpdns.org` trả 502 — cần
người dùng chạy `bash start.sh`. `dist/` vẫn cũ và vẫn trỏ URL `/socket.io/` cũ (đó là #109).
