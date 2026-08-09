# B89 — 3 lỗ hổng npm audit high-severity ở dependency gián tiếp (hướng dẫn thực thi)

Nguồn: phát hiện phụ khi cài `jest-environment-jsdom` cho #88, TODO.md #89 (2026-08-09).

## Cách làm — theo đúng thứ tự ưu tiên đã đánh giá ở TODO.md #89

1. **`socket.io-parser` trước tiên** (production, DoS-relevant):
   - Trên 1 branch riêng (`fix/npm-audit-socketio-parser` hoặc gộp cả 3 gói vào 1 branch dọn dẹp
     dependency, tuỳ lượng thay đổi thực tế sau bước đo — xem mục "Cách làm" chung bên dưới), chạy
     `npm audit fix` (KHÔNG `--dry-run`, KHÔNG `--force` trước) rồi `npm ls socket.io-parser` xác
     nhận có lên `4.2.7` chưa.
   - Nếu lên được `4.2.7` mà KHÔNG cần bump `socket.io`/`socket.io-client` version khai báo trong
     `package.json` (chỉ `package-lock.json` đổi) — an toàn, chạy `npm test` xong commit luôn.
   - Nếu `npm audit fix` không tự giải quyết được (cần `--force`, tức bump major/minor
     `socket.io`/`socket.io-client`) — **dừng lại, không tự bump major** — `socket.io` là phần lõi
     giao tiếp real-time của toàn bộ app, một bump không tương thích có thể vỡ handshake/reconnect/
     event contract hiện có. Cần test thủ công qua ứng dụng thật (Playwright theo quy tắc an toàn
     DB e2e trong CLAUDE.md) trước khi merge, không chỉ dựa vào `npm test`.
2. **`js-yaml`/`nanoid` sau đó** (dev-only, rủi ro thấp) — cùng cách kiểm tra: `npm audit fix` +
   `npm ls`, xác nhận version mới nằm trong range hiện có của `jest`/`vite` hay cần bump chúng.
   Vì cả 2 chỉ ảnh hưởng tooling (không production), nếu cần bump `jest`/`vite` major để hết cảnh
   báo thì cân nhắc mức độ đáng làm ngay hay để dành đợt nâng cấp tooling riêng — không bắt buộc
   khẩn cấp như `socket.io-parser`.

## Bẫy cụ thể

- **Đừng chạy `npm audit fix --force` như bước đầu tiên.** `--force` sẵn sàng bump major version
  bất kể breaking change, có thể âm thầm đổi hành vi `socket.io`/`jest`/`vite` mà không ai để ý cho
  tới khi có bug lạ xuất hiện sau đó — luôn thử semver-safe (`npm audit fix` trơn) trước, chỉ cân
  nhắc `--force` sau khi đã biết chính xác nó sẽ bump gói nào lên version nào.
- **`npm test` xanh không đủ để coi `socket.io-parser` đã an toàn nếu phải bump major** — bộ test
  Jest hiện tại không có test end-to-end nào mô phỏng lỗ hổng "zero-attachment memory exhaustion"
  cụ thể; xanh chỉ chứng minh không vỡ hành vi hiện có, không chứng minh lỗ hổng đã hết. Nếu cần
  verify thật, tìm PoC/test case trong chính advisory GHSA-2m8v-j782-fhvr thay vì tự đoán cách tái
  hiện.
- **Không gộp việc bump `socket.io-parser` chung 1 commit với `js-yaml`/`nanoid`** nếu bất kỳ cái
  nào trong số đó cần bump major (khác gói, khác mức độ rủi ro, khác nhu cầu test — vi phạm "one
  fix, one branch, one commit" nếu gộp chung mà 1 trong 3 cần rollback riêng).
- **Kiểm tra lại `npm ls <pkg>` sau mỗi lần fix** — đừng chỉ tin `npm audit` báo "0 vulnerabilities"
  nữa là xong; xác nhận version thực tế đã lên bản vá đúng như advisory yêu cầu.

## Không thuộc phạm vi

- Không tự ý nâng cấp `express`/`helmet`/`bcrypt`/`better-sqlite3`/... hay bất kỳ dependency nào
  khác ngoài 3 gói đã liệt kê ở #89 — đây là phát hiện phụ, không phải audit toàn bộ
  `package.json` (nếu muốn audit toàn diện, đó là việc riêng, tương tự #9 "Audit an ninh toàn bộ
  server + client").
