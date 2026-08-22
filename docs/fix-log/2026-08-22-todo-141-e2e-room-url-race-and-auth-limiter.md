# Fix log entry — 2026-08-22 10:40

## Prompt

Người dùng: "Do #141." — mục đã ghi từ 2 vòng verify trước (#137/#138) khi `e2e/start-modal-non-blocking.spec.ts`
fail dù không phải hồi quy.

## Action

### Phần 1 — đua `?id=` trên URL

`client/js/room-socket.js`'s `room:joined` handler điều hướng sang `/room.html` **trước**, `?id=`
chỉ được `history.replaceState` gắn vào URL ở một nhịp xử lý riêng, sau khi server trả dữ liệu
phòng. `waitForURL(/room\.html/)` khớp ngay khi điều hướng xong, không đợi `?id=` — spec nào đọc
`searchParams.get('id')` ngay sau đó có thể thua cuộc đua và nhận `roomId = null`.

Quét toàn bộ `e2e/*.spec.ts` dùng mẫu `waitForURL(/room\.html/)`, phân loại:

- **13 file đọc `?id=` ngay sau, không có bước chờ trung gian** — đổi sang
  `waitForURL(/room\.html\?id=/)`: `start-modal-non-blocking.spec.ts` (2 chỗ, mục tiêu ban đầu),
  `resign-flow.spec.ts`, `spectator-join.spec.ts`, `concurrent-move-race.spec.ts`,
  `kick-blocked-interrupted.spec.ts`, `special-cell-rejection.spec.ts`, `swap2-opening.spec.ts`,
  `wall-first-move-zone.spec.ts`, `draw-offer.spec.ts`, `move-validation.spec.ts` (2 chỗ),
  `security-boundary.spec.ts` (2 chỗ), `rematch-overlay-conflict.spec.ts` (2 chỗ),
  `lobby-patch-incremental-render.spec.ts`.
- **4 file đã tự an toàn, không đụng**: `leave-then-create-room.spec.ts`, `real-player-gameplay.spec.ts`,
  `room-no-id-fallback.spec.ts`, `room-lifecycle.spec.ts` — cả bốn chờ
  `expect(#room-id-nav).not.toHaveText('')` trước khi đọc URL. Xác nhận qua `room-socket.js`: trong
  cùng một lượt xử lý `room:joined`, `history.replaceState` gắn `?id=` ở dòng 71, **trước**
  `RoomUI.updateUI()` (dòng 92) set text nav — nên chờ nav không rỗng đã đủ đảm bảo `?id=` có mặt.
- **1 file đã tự sửa từ trước**: `undo.spec.ts` dùng `waitForFunction` chờ trực tiếp
  `searchParams.get('id')` — tương đương về an toàn, không đụng.

### Phần 2 — hai giới hạn per-IP làm nhiễu e2e (đã hỏi người dùng trước khi làm)

Đưa 3 phương án cho người dùng qua `AskUserQuestion`: (A) env override chỉ cho harness — người dùng
chọn; (B) `workers: 1` + tài liệu; (C) để nguyên, ghi nhận cho phiên sau. Theo (A):

- `server/config.js`: thêm `AUTH_LIMITER_MAX = parseInt(process.env.AUTH_LIMITER_MAX, 10) || 20`,
  cùng khuôn mẫu với `MAX_ROOMS_PER_IP` ngay phía trên nó — mặc định giữ nguyên 20 khi không set
  biến, production không đổi.
- `server/routes/auth.js`: `authLimiter`'s `max: 20` → `max: config.AUTH_LIMITER_MAX`; di chuyển
  `require('../config')` lên đầu file (trước đó nằm dưới định nghĩa `authLimiter`, tức chưa tồn tại
  lúc cần dùng).
- `windowMs` (15 phút) và `MAX_ROOMS_PER_IP` giữ nguyên, không đụng — đúng "không đụng" trong
  `docs/instruction/B141-*.md`.

## Decision

Không gộp việc "sửa" hai giới hạn per-IP vào cùng lượt với phần 1 dù đã biết nguyên nhân từ trước —
theo đúng `instruction.md` §B141 ("đừng 'sửa' bằng cách nới ngưỡng mặc định; chốt với người dùng
cách làm trước khi đụng vào"), dừng lại hỏi trước khi viết bất kỳ dòng code nào cho phần 2.

Không đụng đến các bug khác lộ ra trong lúc verify: `security-boundary.spec.ts`'s `AUTH_REQUIRED`
(raw `socket.io-client` qua JWT fallback, tái hiện y hệt trên bản trước sửa) và
`lobby-patch-incremental-render.spec.ts`'s assertion `touchedRoomIds` sai (bug logic riêng của B117,
lộ ra chỉ sau khi nới tạm `MAX_ROOMS_PER_IP` để verify phần 1, không phải do sửa `?id=`) — cả hai
ngoài phạm vi #141, cần mục riêng nếu người dùng muốn theo đuổi.

## Summary output

Verify phần 1: server throwaway cổng 3111 (db tạm theo `playwright-e2e-safety`; phải tự export
`CORS_ORIGIN=http://localhost:3111` vì `server/utils/load-env.js` nạp `.env` — ghim domain production
— vào `process.env` lúc khởi động, khiến `verifySocketToken` từ chối origin `localhost`; không thấy
được qua `/proc/PID/environ` vì đó là mutation trong tiến trình Node, không phải env lúc `exec`).
`start-modal-non-blocking.spec.ts` chromium+firefox: **4/4 pass** (từng timeout 100% cả 3 trình
duyệt trước sửa, xác nhận bằng cách stash riêng file này chạy lại bản gốc). 12/13 spec còn lại pass
khi chạy riêng lẻ + khởi động lại server giữa mỗi file (né `authLimiter`); `security-boundary.spec.ts`
và `lobby-patch-incremental-render.spec.ts` fail nhưng xác nhận không liên quan tới `?id=` (xem
Decision). `start-modal-non-blocking.spec.ts` trên **webkit vẫn fail như cũ** (click `#btn-quick-match`
không điều hướng gì cả) — pre-existing, xác nhận bằng cách chạy lại bản gốc trên webkit, y hệt.

Verify phần 2: `AUTH_LIMITER_MAX=5` trên server throwaway → request thứ 6 tới `/api/auth/guest` trả
đúng **429**; không set biến → vẫn 20 (test mới `server/tests/auth-limiter-config.test.js`, 3 case
theo khuôn `room-capacity-config.test.js`). `auth-rate-limit-ip.test.js` (test 20-request budget có
sẵn) vẫn pass nguyên.

`npm test` **1230/1230** (1227 + 3 test mới). `client/js/`/`client/css/` không đổi, không cần bump
`?v=`. Server đọc/ghi thật vào `server/db/gomoku.db` **KHÔNG** đụng — mọi lần chạy Playwright/verify
đều qua db tạm theo `playwright-e2e-safety` (mv real db aside → server mới tạo db rỗng từ
`schema.sql` → xoá db tạm → mv real db về, xác nhận qua mtime file gốc không đổi sau khi khôi phục).
`fix/e2e-room-url-race-and-auth-limiter-override` off **`dev`** (cả TODO.md #141 lẫn
`docs/todo/B141-*.md` chỉ tồn tại trên `dev`, không có trên `main`).
