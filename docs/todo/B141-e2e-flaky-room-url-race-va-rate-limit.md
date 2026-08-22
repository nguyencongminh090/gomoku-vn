# #141 — `e2e/start-modal-non-blocking.spec.ts` flaky: đua với `?id=` trên URL; và 2 giới hạn per-IP làm nhiễu mọi lần chạy e2e

**Trạng thái:** ✅ Đã sửa 2026-08-22 (cả 2 phần).

**Nguồn:** phát hiện khi verify #137 rồi #138 (2026-08-21/22) — spec này fail **cả trên `HEAD` chưa
có bản sửa nào**, trên server mới tinh, nên không phải hồi quy của hai mục đó.

## 1. Đua với `?id=` (nguyên nhân thật của flakiness)

```js
await A.page.click('#btn-quick-match');
await A.page.waitForURL(/room\.html/, { timeout: 15000 });
const roomId = new URL(A.page.url()).searchParams.get('id');   // ← có thể là null
```

`waitForURL(/room\.html/)` khớp **ngay khi** điều hướng sang `/room.html` xong, nhưng `?id=` chỉ
được gắn vào URL một nhịp sau. Khi thua cuộc đua, `roomId` là `null` ⇒ người chơi B vào
`/room.html?id=` không có id và bị đá về lobby ⇒ `#room-id-nav` không bao giờ có text và spec fail ở
`expect(...).not.toHaveText('')`.

Đã quan sát trực tiếp: trong một script đo, `A.page.url()` sau `waitForURL(/room\.html/)` trả về
`http://localhost:3111/room.html` — **không có** query string.

**Hướng sửa:** đổi thành `waitForURL(/room\.html\?id=/)`. `e2e/start-modal-board-centering.spec.ts`
(thêm ở #137) đã dùng dạng này và không flaky qua nhiều lần chạy. Quét luôn các spec khác trong
`e2e/` dùng cùng mẫu `waitForURL(/room\.html/)`.

**✅ Đã sửa (2026-08-22).** Đổi `waitForURL(/room\.html/)` → `waitForURL(/room\.html\?id=/)` ở 13
file: `start-modal-non-blocking.spec.ts` (2 chỗ, mục tiêu ban đầu), `resign-flow.spec.ts`,
`spectator-join.spec.ts`, `concurrent-move-race.spec.ts`, `kick-blocked-interrupted.spec.ts`,
`special-cell-rejection.spec.ts`, `swap2-opening.spec.ts`, `wall-first-move-zone.spec.ts`,
`draw-offer.spec.ts`, `move-validation.spec.ts` (2 chỗ), `security-boundary.spec.ts` (2 chỗ),
`rematch-overlay-conflict.spec.ts` (2 chỗ), `lobby-patch-incremental-render.spec.ts` — mọi chỗ đọc
`?id=` ngay sau `waitForURL` không có bước chờ trung gian nào bảo vệ. Bỏ qua bốn file đã tự an toàn
sẵn (`leave-then-create-room.spec.ts`, `real-player-gameplay.spec.ts`, `room-no-id-fallback.spec.ts`,
`room-lifecycle.spec.ts`) vì chúng chờ `#room-id-nav` có text trước khi đọc URL — xác nhận qua
`client/js/room-socket.js` (`room:joined` handler): `history.replaceState` gắn `?id=` **trước**
`RoomUI.updateUI()` set text nav, cùng một lượt đồng bộ, nên chờ nav không rỗng là đủ an toàn. Cũng
bỏ qua `undo.spec.ts` — đã tự có `waitForFunction` chờ `?id=` riêng, tương đương về mặt an toàn.

Verify: chạy `PLAYWRIGHT_BASE_URL=http://localhost:3111 npx playwright test <file>` với server
throwaway (db tạm theo `playwright-e2e-safety`, `CORS_ORIGIN=http://localhost:3111` export tay vì
`server/utils/load-env.js` nạp `.env` — vốn ghim domain production — vào `process.env` lúc khởi động
và khiến `verifySocketToken`/`isAllowedOrigin` từ chối origin `localhost`, không thấy qua
`/proc/PID/environ` vì đó là mutation trong tiến trình Node, không phải env lúc exec).
`start-modal-non-blocking.spec.ts` **chromium+firefox: 4/4 pass** (từng timeout 100% trước sửa).
12/13 spec còn lại pass trên chromium sau khi chạy riêng lẻ + khởi động lại server giữa các file
(tránh `authLimiter`); `security-boundary.spec.ts` fail nhưng **tái hiện y hệt trên bản trước khi
sửa** (`AUTH_REQUIRED` từ raw `socket.io-client` dùng JWT fallback — lỗi riêng, không liên quan
`?id=`, không thuộc phạm vi #141). `lobby-patch-incremental-render.spec.ts` fail do đúng
`MAX_ROOMS_PER_IP=3` mặc định (tạo 4 phòng cùng IP) — xác nhận bằng cách nới tạm
`MAX_ROOMS_PER_IP=10` cho một lần chạy verify: điều hướng qua cả 4 phòng thành công (chứng minh sửa
`?id=` đúng), phần fail còn lại của test đó là bug logic assertion riêng của B117, ngoài phạm vi
#141. `start-modal-non-blocking.spec.ts` trên **webkit vẫn fail như cũ** (click `#btn-quick-match`
không điều hướng gì cả, tái hiện y hệt trên bản gốc) — pre-existing, không phải hồi quy hay thuộc
phạm vi #141.

## 2. Hai giới hạn per-IP làm nhiễu mọi lần chạy e2e

Không phải bug sản phẩm — nhưng làm kết quả e2e không đọc được nếu không biết trước, và đã hai lần
khiến tôi chẩn đoán nhầm "hồi quy" trong lúc verify #137/#138:

- `authLimiter` (`server/routes/auth.js`): **20 request / 15 phút / IP** trên toàn bộ `/api/auth/*`.
  Mỗi guest test tốn vài request (guest + các lần `requireAuth` khi chuyển trang), nên chỉ ~6-8
  guest là hết hạn mức. Triệu chứng: `"guest auth should succeed"` fail, hoặc `#room-id-nav`
  "element(s) not found" vì trang bị đá về `login.html`. Store nằm trong bộ nhớ ⇒ khởi động lại
  server là reset.
- `MAX_ROOMS_PER_IP` (`server/config.js`, mặc định **3**): 4 test tạo phòng liên tiếp từ cùng IP là
  test thứ 4 không tạo được phòng, vì phòng cũ còn nằm trong thời gian grace.

**Hướng sửa (cần chốt với người dùng trước khi làm):** cho phép nới hai ngưỡng này qua biến môi
trường chỉ dùng cho harness e2e (`MAX_ROOMS_PER_IP` đã đọc từ env sẵn; `authLimiter` thì chưa), hoặc
đặt `workers: 1` + tài liệu hoá cách chạy. **Không** nới ngưỡng mặc định của production — cả hai là
biện pháp chống lạm dụng có chủ đích (`docs/todo/B07-*.md`).

**✅ Đã sửa (2026-08-22).** Người dùng chốt phương án: env override chỉ cho harness (như
`MAX_ROOMS_PER_IP` đã có sẵn). Thêm `AUTH_LIMITER_MAX` vào `server/config.js`
(`parseInt(process.env.AUTH_LIMITER_MAX, 10) || 20` — cùng khuôn mẫu, mặc định giữ nguyên 20 khi
không set biến), nối vào `authLimiter` trong `server/routes/auth.js` (`max: config.AUTH_LIMITER_MAX`
thay cho hằng số `20`). `windowMs` giữ nguyên, không đụng. Verify: `AUTH_LIMITER_MAX=5` trên server
throwaway 3111 → request thứ 6 trả **429** đúng như kỳ vọng; mặc định không set biến → vẫn 20 (test
mới `server/tests/auth-limiter-config.test.js`, 3 case theo khuôn `room-capacity-config.test.js`:
default/override/fallback-khi-không-phải-số). `auth-rate-limit-ip.test.js` (test 20-request budget
có sẵn) vẫn pass nguyên vì default không đổi. `npm test` **1230/1230** (1227 + 3 test mới).

## Liên quan

- `docs/fix-log/2026-08-22-todo-137-start-modal-overlay-respects-drawer.md` — lần đầu vấp phải.
- `docs/fix-log/2026-08-22-todo-138-drawer-inert-when-collapsed.md` — lần thứ hai, và là lý do mục
  này được ghi lại thay vì sửa kèm.
