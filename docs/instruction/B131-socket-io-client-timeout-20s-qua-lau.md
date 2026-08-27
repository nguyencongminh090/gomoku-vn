# B131 — Giảm `timeout` của socket.io-client xuống 8 s

Hướng dẫn thực thi cho TODO.md #131 (chưa làm).

## Trước khi bắt đầu

- Đọc `docs/todo/B131-socket-io-client-timeout-20s-qua-lau-khi-mat-goi-syn.md`.
- Đây là **giảm thiệt hại**, không phải sửa nguyên nhân gốc. Nguyên nhân gốc là **mất gói SYN trên
  chặng trình duyệt người chơi ↔ Cloudflare edge** — nằm ngoài tầm kiểm soát của server, không sửa
  được bằng code. (#130 từng bị nghi là nguyên nhân nhưng **đã bị log bác bỏ** — xem
  `docs/todo/A130-*.md`.) Đừng mô tả mục này như "đã sửa lỗi mạng chậm" trong summary.
- Nhánh theo `git-workflow` skill; server thật đang có người chơi qua tunnel → không sửa trực tiếp
  bản đang phục vụ.

## Cách tiếp cận khi làm

1. Thêm đúng **một** dòng `timeout: 8000,` vào object truyền cho `io({...})` trong
   `client/js/socket-client.js`, cạnh `reconnectionDelayMax: 5000`.
2. Giữ nguyên `transports: ['websocket', 'polling']` + `tryAllTransports: true` — thứ tự này đã được
   đo và ghi trong comment ngay tại chỗ (`docs/stress-test-report.md` §10, TODO.md #28/#29). **Đừng
   nhân tiện đổi lại thành polling-first** vì thấy websocket là thứ đang chậm trong HAR: HAR cho
   thấy *cả hai* lần đều là mất gói ở tầng TCP/SYN, polling sẽ dính y hệt.
3. Giữ nguyên `reconnectionAttempts: Infinity`, `reconnectionDelay: 1000`,
   `reconnectionDelayMax: 5000` — không đụng.
4. Bump `?v=130` → `?v=131` **toàn bộ** theo quy tắc cache-busting trong `CLAUDE.md`: cả
   `client/*.html` lẫn mọi `import '...?v=N'` trong `client/js/*.js` (kể cả file không phải
   `*-entry.js`), trừ 2 file mockup được pin cố định. Check hoàn thành:
   ```
   grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup
   ```
   phải ra đúng **một** giá trị `?v=131`.

## Xác minh

- ~~Không có test tự động cho `client/js/`~~ — **sai, đã sửa lại**: `client/tests/` có sẵn 9 file
  jsdom test chạy trong `npm test`. Viết test ở đó (mẫu: `room-slot-status-active-inactive.test.js`
  — `window.eval(source)` với `io`/`GvnSession` stub). Kiểm chứng test không rỗng bằng cách bỏ bản
  sửa ra và xác nhận nó fail.
- Xác minh bằng trình duyệt thật: mở `room.html`, DevTools → Network, xác nhận vẫn kết nối bình
  thường và banner "Đang kết nối…" biến mất như cũ.
- Đường thất bại **mô phỏng được** bằng `context.routeWebSocket('**/socket.io/**', () => {})` —
  Playwright nuốt handshake, tái tạo đúng kiểu WS#1 trong HAR (transport được chấp nhận nhưng gói
  OPEN của engine.io không bao giờ tới) — rồi đo tới `connect_error` đầu tiên. Đã đo: 20 120 ms
  (không sửa) → 8 122 ms (có sửa).
- Playwright: theo `playwright-e2e-safety` skill. `DB_PATH` trong `server/db/database.js:18` là
  **hard-code**, không có env override ⇒ đổi cổng thôi **không** đủ để tách DB. Cách đã dùng: copy
  `client/ server/ package.json .env` sang scratchpad (loại `*.db`), symlink `node_modules`, đặt
  `PORT`/`CORS_ORIGIN` riêng — instance tự tạo DB mới trong scratchpad.
- **Lưu ý môi trường:** server thật serve trực tiếp từ `client/` trong chính checkout này, nên sửa
  file client là live ngay với người chơi; branch không cô lập được. Bump `?v=` cùng lúc với sửa file
  để trạng thái phát ra luôn nhất quán.

## Phạm vi KHÔNG làm

- Không sửa `SocketHandler.js` phần eviction/`session:kicked` "cho chắc". Mục "Điểm cần theo dõi"
  trong file TODO là **quan sát**, chưa phải lỗi đã xác nhận — sửa mù ở đó dễ tái sinh đúng lỗi
  false-kick mà comment tại chỗ đang phòng.
- Không đổi `pingTimeout`/`pingInterval` của socket.io server nhân tiện.
- Không đụng `server/index.js`.
