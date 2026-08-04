# Phần B #44. `getClientIp()` đọc `CF-Connecting-IP` thay vì suy luận qua

**Nguồn:** `gomoku-vn-review(1).md` vòng 3, mục 12.6 — chuyển từ Phần A #10, xác nhận qua Cloudflare API (2026-08-04)


44. ~~**`getClientIp()` đọc `CF-Connecting-IP` thay vì suy luận qua
    `X-Forwarded-For`**~~
    **✅ ĐÃ XONG (2026-08-04)** — `getClientIp(socket)` (`server/socket/state.js`)
    nay đọc `socket.handshake.headers['cf-connecting-ip']` trước tiên, dùng
    thẳng nếu có mặt. Không có header đó → giữ nguyên fallback cũ
    (`X-Forwarded-For` chỉ khi peer loopback, ngược lại dùng
    `socket.handshake.address`), đúng phạm vi `instruction.md` §44 — không
    xoá nhánh fallback, không đụng tầng Express `trust proxy`.
    Test: file mới `server/tests/get-client-ip.test.js` (8 case — ưu tiên
    CF header kể cả khi khác XFF, kể cả khi peer không loopback; fallback
    XFF cho peer loopback IPv4/IPv6; không có header nào → dùng peer;
    không có address/không có CF header → `undefined`). `npm test`:
    393/393 xanh (tăng 8 so với baseline 385, không hồi quy). Chi tiết:
    `docs/fix-log.md` 2026-08-04 08:00.

    - **Ở đâu:** `server/socket/state.js` — `getClientIp(socket)`.
    - **Vì sao:** hiện tại chỉ tin `X-Forwarded-For` khi
      `socket.handshake.address` là loopback (mirror `trust proxy:
      'loopback'` phía Express) — đúng cho deployment hiện tại, nhưng vẫn là
      suy luận gián tiếp qua 1 header có thể mang nhiều IP (thứ tự client tự
      ghi được). Đã xác nhận qua Cloudflare API (không cần probe traffic
      thật): zone `play3cr.dpdns.org` proxied qua Cloudflare thật
      (`proxied: true`), nên Cloudflare **luôn tự set** `CF-Connecting-IP` ở
      edge bằng đúng 1 giá trị (IP client thật), **ghi đè chứ không nối
      thêm**, và client không giả mạo được — khác hẳn `X-Forwarded-For` vốn
      có thể có nhiều giá trị nối chuỗi.
    - **Đánh giá hiệu quả/an toàn:** rẻ, an toàn — đọc thẳng 1 header rõ
      ràng thay vì duyệt/tin tưởng có điều kiện một header mơ hồ hơn; loại
      bỏ hẳn lớp giả định "Cloudflare nối thêm IP vào cuối" mà trước đây
      cần xác minh bằng traffic thật.
    - **Vẫn phải giữ fallback** — không phải mọi deployment tương lai đều
      chắc chắn đi qua Cloudflare (nếu port `3000` từng bị lộ ra ngoài trực
      tiếp, hoặc đổi sang proxy khác); giữ nguyên logic cũ
      (`X-Forwarded-For` khi peer là loopback) làm fallback khi
      `CF-Connecting-IP` không có mặt, không xoá hẳn.
    - **Test dự kiến:** mở rộng `server/tests/LobbyHandler.test.js`/test
      cho `getClientIp` — case có `CF-Connecting-IP` thì ưu tiên dùng nó
      (kể cả khi `X-Forwarded-For` khác giá trị, để lộ rõ ưu tiên đúng);
      case không có `CF-Connecting-IP` thì rơi về hành vi cũ
      (`X-Forwarded-For` khi loopback, ngược lại dùng địa chỉ gốc).
