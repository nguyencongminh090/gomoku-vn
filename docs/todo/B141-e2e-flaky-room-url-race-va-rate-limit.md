# #141 — `e2e/start-modal-non-blocking.spec.ts` flaky: đua với `?id=` trên URL; và 2 giới hạn per-IP làm nhiễu mọi lần chạy e2e

**Trạng thái:** ⏳ Chưa làm.

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

## Liên quan

- `docs/fix-log/2026-08-22-todo-137-start-modal-overlay-respects-drawer.md` — lần đầu vấp phải.
- `docs/fix-log/2026-08-22-todo-138-drawer-inert-when-collapsed.md` — lần thứ hai, và là lý do mục
  này được ghi lại thay vì sửa kèm.
