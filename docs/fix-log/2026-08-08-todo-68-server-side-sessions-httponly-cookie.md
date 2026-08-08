# Fix log entry — 2026-08-08 12:55

## Prompt

Chuỗi ba lượt trong cùng một phiên:

1. *"Do #68"* — thực hiện `TODO.md` #68 (cân nhắc chuyển JWT từ `localStorage` sang `HttpOnly`
   cookie). `instruction.md` B68 quy định **không code trực tiếp**, phải mở `features/` thảo luận
   trước → sản phẩm lượt này là thư mục thảo luận, không phải code.
2. *"What are solution of professinal/big site? Search for solution."* — khảo sát chuẩn ngành và
   thực tế site lớn.
3. *"Could we implement mechanics as big tech did?"* rồi chốt phạm vi bằng chỉ thị **"Follow
   standard & real-world practices."**

## Action

**Lượt 1 — thư mục thảo luận** `features/jwt-httponly-cookie/` theo cấu trúc cố định trong
`CLAUDE.md` (`user_story.md`, `diagram/uml_diagram/` × 2, `diagram/state-diagram-*.md`,
`planning.md`). Khảo sát code trước khi viết, phát hiện hai điều làm thay đổi hình dung ban đầu:

- **Server nhỏ hơn dự đoán:** JWT chỉ được xác thực ở đúng một chỗ (`verifySocketToken` qua
  `io.use()`). Middleware Express `verifyToken` được export nhưng **chưa từng mount** ở route nào,
  và không có `Authorization: Bearer` nào trong `client/js/` → bề mặt CSRF hôm nay ~0.
- **Client lớn hơn dự đoán:** `getUserInfo()` giải mã payload JWT bằng `atob` ở **hai bản sao gần
  như y hệt** (`socket-client.js`, `settings-panel.js`) với 6 nơi gọi.

**Lượt 2 — khảo sát ngành.** OWASP Session Management Cheat Sheet và RFC 9700 đều khuyến cáo tường
minh việc để credential trong `localStorage`. Nhưng site lớn đi xa hơn đề xuất ban đầu:
Google/GitHub dùng **session mờ phía server** (`_gh_sess`), mẫu BFF/Token Handler giữ token hoàn
toàn ngoài trình duyệt. Lý do: **thu hồi được**. Phát hiện thêm một rủi ro chưa ai nêu: chuyển sang
cookie **mở ra CSWSH**, thứ `localStorage` miễn nhiễm — và `cors.origin` của Socket.IO **không** bảo
vệ WebSocket.

**Lượt 3 — triển khai phương án C** trên `feature/jwt-httponly-cookie` (nhánh từ `dev`):

- **DB:** bảng `sessions` (id mờ 256-bit, `user_id`, `display_name`, `is_guest`, `expires_at`,
  `revoked_at`), **cố ý không** `REFERENCES users(id)` vì guest không có hàng trong `users`; + CRUD
  trong `database.js`.
- **`managers/SessionManager.js`** (mới): sinh id bằng `crypto.randomBytes(32)`, tra cứu có kiểm
  hạn/thu hồi, thu hồi, dọn định kỳ.
- **`utils/session-cookie.js`** (mới): một chỗ duy nhất định nghĩa cookie (`HttpOnly`,
  `SameSite=Lax`, `Path=/`, `Secure` **suy từ `req.secure`**), + parser cookie dùng chung cho cả
  Express lẫn socket handshake (Socket.IO không đi qua middleware Express).
- **`routes/auth.js`:** 3 route cấp phiên qua `Set-Cookie`, **bỏ `token` khỏi body**; thêm
  `POST /logout` (thu hồi thật) và `POST /upgrade-session` (migration, **giữ nguyên hạn còn lại**).
- **`middleware/auth.js`:** `verifySocketToken` kiểm `Origin` (CSWSH) rồi tra phiên từ cookie;
  fallback JWT chỉ khi **không có** cookie — cookie chết **không** rơi xuống fallback.
- **`SocketHandler.js`:** `session:kicked` ghi `revoked_at` **trước** khi ngắt socket; phát
  `session:me` để client biết mình là ai.
- **Client:** `session.js` (mới) thay hai bản `getUserInfo()` trùng lặp; auth guard, logout (giờ là
  network call có thể fail), migration nền; `RoomState.myUser` và identity ở 4 trang đổi thành
  **getter sống** thay vì snapshot; bump `?v=79` → `?v=80`.

## Decision

- **Chọn C (session mờ phía server) thay vì "JWT trong cookie".** Chỉ thị "follow standard &
  real-world practices" chỉ tới cơ chế của Google/GitHub, không phải bước tối thiểu. Đánh đổi: #68
  từ "token nằm ở đâu" thành "phiên quản lý thế nào" — đã ghi rõ vào `docs/todo/B68-*.md`.
- **`SameSite=Lax` + kiểm `Origin` bắt buộc.** Lax giữ được trải nghiệm mở link phòng từ app chat;
  Origin là lớp thứ hai vì không được phụ thuộc một lớp duy nhất.
- **Không thêm cache RAM.** `server/scripts/bench-session-lookup.js` (SQLite trên đĩa + WAL, file
  tạm) đo: burst 6000 kết nối cùng lúc với bảng 100k hàng chỉ chặn event loop **58,6 ms** tổng, p50
  7,9 µs. Không đủ để biện minh cho cache.
- **Dual-read có thời hạn** thay vì đá sạch: guest bị đá là mất phiên vĩnh viễn. Fallback + endpoint
  `/upgrade-session` phải xoá sau ≥7 ngày.
- **Sửa kèm một lỗi lộ ra do thay đổi:** `chat-ui.js` so `msg.from` với `myUser.username`, trong khi
  server gửi `displayName` — tin nhắn của chính mình chưa bao giờ hiển thị đúng kiểu "self". Session
  không có `username` nên buộc phải chạm dòng này; đã sửa sang `displayName`. Đây là thay đổi hành vi
  hiển thị, nêu rõ ở đây thay vì lặng lẽ.

## Summary output

- **Jest: 931/931 xanh, 39 suite** (thêm 76 test mới trong 3 file: `session-manager.test.js`,
  `socket-session-auth.test.js`, `auth-session-routes.test.js`). 5 suite auth cũ được cập nhật theo
  hợp đồng mới, không xoá test nào.
- **Trình duyệt (Playwright, 26/26):** db thật đã dời ra trước khi chạy và khôi phục sau
  (md5 khớp nguyên vẹn).
  - `document.cookie` **rỗng** — không thấy `gvn_session`; không còn credential trong `localStorage`
    (chỉ còn `gvn_user` không bí mật). Đây là phép thử chứng minh mục tiêu #68 đã đạt.
  - Cookie `httpOnly=true, sameSite=Lax, path=/`.
  - Phiên bị thu hồi → lần kết nối sau bị đá về login; đăng xuất qua **nút thật trong settings
    panel** ghi `revoked_at`.
  - Migration: token cũ 12h → phiên thật, **còn đúng 12,00h** (không gia hạn), guest giữ nguyên
    danh tính; token hết hạn → về login và bị xoá để không retry mãi.
  - Đăng ký → lobby → tạo phòng → chat: tên hiển thị tiếng Việt "Người Chơi" render đúng,
    `RoomState.myUser` sống, tin nhắn của mình hiển thị đúng kiểu self.
- **Còn nợ (đã ghi vào `planning.md` bước 12):** xoá fallback JWT + `/upgrade-session` sau ≥7 ngày.
