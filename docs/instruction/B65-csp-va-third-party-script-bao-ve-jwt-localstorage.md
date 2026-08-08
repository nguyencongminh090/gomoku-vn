# B65. CSP và third-party script — bảo vệ JWT bearer trong `localStorage`

### Mục tiêu

Giảm khả năng mã JavaScript không được tin cậy chạy trong origin và đọc
`localStorage.gvn_token`. Đây là hardening của execution boundary, không phải
thay đổi quyền xem lobby, spectator hay lịch sử ván đã được product cho phép.

### Cách làm

1. Lập inventory toàn bộ `<script src>`, inline script, external stylesheet,
   font, audio và endpoint kết nối ở những trang ship trong `client/`. Không
   dùng mockup như bằng chứng cho runtime production.
2. Thay `https://unpkg.com/@phosphor-icons/web` bằng asset được kiểm soát trong
   repo/build. Nếu chưa thể self-host, pin version + SRI chỉ là biện pháp tạm;
   nó không thay CSP hay kiểm soát dependency supply chain.
3. Chuyển inline script/style sang nonce/hash phù hợp rồi bật CSP enforce qua
   Helmet. Policy phải chặt theo loại resource; bắt đầu bằng `default-src
   'self'`, `object-src 'none'`, `base-uri 'self'`, sau đó thêm chính xác
   origin cần thiết. Không thêm `unsafe-inline` vào `script-src` để "cho chạy".
4. Kiểm thử header ở HTTP level và chạy browser thật trên login, lobby, room,
   history, tournament detail và tournament match. Theo dõi console CSP,
   request blocked và socket connection trước khi chuyển từ report-only (nếu
   dùng giai đoạn đó) sang enforce.

### Ràng buộc và bẫy

- `client/*.html` hiện có script inline pre-paint cho theme/UI mode. Bật CSP
  default của Helmet ngay sẽ làm UI lỗi; phải đưa chúng vào nonce/hash hoặc
  external file trước khi enforce.
- Socket.IO có WebSocket-first và polling fallback. `connect-src` phải cho
  đúng same-origin `https:`/`wss:` runtime; không hardcode `ws://` vì sẽ phá
  deployment TLS.
- Các trang hiện tham chiếu Google Fonts, external audio và icon CDN. Mỗi
  origin được allow phải có lý do, đúng directive và được test; đừng dùng `*`.
- `localStorage` bearer token vẫn nhìn thấy trong DevTools của người đang đăng
  nhập. Đó là tính chất của mô hình hiện tại, không phải leak cross-user; mục
  này bảo vệ trước XSS/supply-chain script đọc nó.
- CSP không bù cho HTTP trần. Giữ A1: Cloudflare Tunnel/TLS và không public
  trực tiếp port Node.

### Không làm

- Không đổi auth sang cookie `HttpOnly`/CSRF trong mục này.
- Không nới CSP bằng `unsafe-inline`, `*`, hoặc allow toàn bộ CDN chỉ để nhanh
  qua test.
- Không sửa `client/js/socket-client.js` để ép `ws://`/`wss://`; quy tắc chung
  trong `instruction.md` đã cấm đụng vào lựa chọn transport đó.
- Không gộp thay đổi privacy của public history/spectator/lobby vào B65.

### Test tối thiểu

- Test response header CSP enforce và absence của remote executable script.
- E2E: login/guest, load từng trang, kết nối Socket.IO bằng websocket và fallback
  polling, không console CSP error, không resource bắt buộc bị block.
- Sau khi chạm file `client/`, chạy kiểm tra một giá trị cache-bust `?v=N` duy
  nhất theo `CLAUDE.md`.
