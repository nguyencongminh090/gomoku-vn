# Phần B #30. `MAX_ROOMS_PER_IP` có thể đang là cap theo cả site, không phải theo

**Nguồn:** điều tra #18 vòng 2 trên `play3cr.dpdns.org` (2026-08-02)


30. ~~**`MAX_ROOMS_PER_IP` có thể đang là cap theo cả site, không phải theo
    từng người dùng thật, khi chạy sau Cloudflare Tunnel**~~
    **✅ ĐÃ SỬA (2026-08-02)**
    - Trong lúc điều tra #18 vòng 2, sửa lỗi crash `trust proxy` (xem
      `docs/fix-log.md` dòng 2026-08-02 21:05) thì phát hiện thêm:
      `socket.handshake.address` (dùng để tính `creatorIp` cho quota, xem
      [server/socket/handlers/LobbyHandler.js:56](server/socket/handlers/LobbyHandler.js#L56))
      đọc thẳng `req.connection.remoteAddress` ở tầng engine.io — **không bao
      giờ** nhìn header `X-Forwarded-For`, bất kể Express có `trust proxy`
      hay không (đó là hai tầng khác nhau, fix vừa rồi chỉ chỉnh Express).
    - Với deployment hiện tại (cloudflared chạy trên cùng máy, kết nối vào
      Node qua loopback), điều này nghĩa là **mọi user thật đều có cùng một
      `creatorIp` là loopback** — quota "tối đa 3 phòng mỗi IP" (thiết kế để
      chặn 1 IP chiếm hết `MAX_ROOMS`) thực chất đang giới hạn **toàn bộ site
      chỉ 3 phòng đang sống cùng lúc**, bất kể có bao nhiêu người dùng khác
      nhau thật sự đang tạo phòng.
    - Ban đầu để ngỏ chờ xác nhận (đây từng là Phần A #1 — "không sửa được
      bằng code" — vì chưa biết deployment thật có proxy gì, hop bao nhiêu).
      Buổi làm việc tiếp theo xác nhận rõ: đúng là Cloudflare Tunnel, đúng 1
      hop qua loopback — đủ thông tin để sửa an toàn, không còn là quyết định
      ngoài code nữa.
    - **Sửa:** thêm `getClientIp(socket)` (`server/socket/state.js`) — cùng
      logic với `trust proxy: 'loopback'` phía Express: chỉ đọc
      `X-Forwarded-For` khi chính `socket.handshake.address` là loopback,
      nếu không thì dùng `socket.handshake.address` như cũ. Không cho phép
      giả mạo `X-Forwarded-For` để né quota nếu port lỡ bị lộ ra ngoài trực
      tiếp (không qua tunnel). `LobbyHandler.js` dùng hàm này thay vì đọc
      `socket.handshake.address` trực tiếp.
    - **Test:** `server/tests/LobbyHandler.test.js` — 3 test mới (dùng địa
      chỉ thường, dùng địa chỉ sau proxy loopback + forwarded header, và
      không tin forwarded header khi kết nối không thực sự là loopback).
      Mock `state` lấy `getClientIp` thật qua `jest.requireActual` thay vì
      viết lại logic riêng, tránh lệch với bản thật. Mutation-check: revert
      riêng `state.js` → 6 test fail (3 mới + 3 cũ phụ thuộc field `ip`) →
      khôi phục → `npm test`: 298/298 xanh.
