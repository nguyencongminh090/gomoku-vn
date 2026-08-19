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

- **Không có test tự động cho `client/js/`** trong repo này — nói thẳng điều đó trong summary thay
  vì im lặng bỏ qua (quy tắc `CLAUDE.md`). `npm test` vẫn phải chạy để chắc không vỡ gì phía server.
- Xác minh bằng trình duyệt thật: mở `room.html`, DevTools → Network, xác nhận vẫn kết nối bình
  thường và banner "Đang kết nối…" biến mất như cũ.
- Muốn xác minh đúng *hành vi mới* (retry sau 8 s thay vì 20 s) thì phải mô phỏng mất kết nối lần
  đầu — ví dụ chặn tạm host ở tầng mạng rồi mở lại — và đo bằng đồng hồ. Nếu không mô phỏng được,
  ghi rõ "chưa xác minh được đường thất bại" thay vì tuyên bố đã xác minh.
- Nếu dùng Playwright: theo `playwright-e2e-safety` skill — không chạm database thật.

## Phạm vi KHÔNG làm

- Không sửa `SocketHandler.js` phần eviction/`session:kicked` "cho chắc". Mục "Điểm cần theo dõi"
  trong file TODO là **quan sát**, chưa phải lỗi đã xác nhận — sửa mù ở đó dễ tái sinh đúng lỗi
  false-kick mà comment tại chỗ đang phòng.
- Không đổi `pingTimeout`/`pingInterval` của socket.io server nhân tiện.
- Không đụng `server/index.js`.
