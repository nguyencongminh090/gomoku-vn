# Fix log entry — 2026-08-06 21:45

## Prompt

User report (kèm server log, chỉ mở đúng 1 tab): "Tài khoản của bạn vừa đăng nhập ở một thiết bị khác, phiên này đã bị ngắt kết nối." hiện ra và bị đăng xuất dù chỉ mở một tab trình duyệt duy nhất, không có thiết bị/tab thứ hai nào đăng nhập.

## Action

Dùng subagent Explore đọc code xác nhận nguyên nhân. Log server cho thấy mỗi "phiên" thực chất có 2 sự kiện `Connected` cách nhau vài giây (sid khác nhau) rồi cả 2 đều `Disconnected` — khớp với hành vi tự-reconnect nội bộ của socket.io-client sau khi mất transport (ping timeout/wifi chập chờn), không phải người dùng mở tab thứ hai.

Đọc [server/socket/SocketHandler.js](server/socket/SocketHandler.js) L97-117: logic "single-device-per-token" chỉ khoá theo `userId` — bất kỳ `connection` mới nào cho cùng userId, kể cả reconnect nội bộ của chính tab đó, đều bị coi là "đăng nhập thiết bị khác" và kick socket cũ (emit `session:kicked` khiến client tự logout + redirect `login.html`). Code đã có sẵn cờ `auth.reconnect` (set ở [client/js/socket-client.js](client/js/socket-client.js) L77-86 khi Manager phát `reconnect_attempt`, đọc ở SocketHandler.js L173 cho một mục đích khác — kiểm tra phòng còn tồn tại) nhưng logic kick ở L108-112 (cũ) hoàn toàn không tham chiếu cờ này.

Phát hiện phụ trong lúc đọc code: `wrappedOn` (L119-133 cũ) sanitize mọi payload không phải object thành `{}`, áp dụng luôn cho event built-in `disconnect` — mà socket.io gọi listener của `disconnect` với một **string** reason (`"ping timeout"`, `"transport close"`,...), nên bị ép thành `{}`, khớp chính xác với `reason=[object Object]` thấy trong log. Bug này không gây ra sự cố kick nhầm, nhưng che mất tín hiệu chẩn đoán (không thể biết disconnect là do mất mạng hay chủ động) — sửa luôn vì phát hiện trực tiếp trong lúc điều tra fix chính, cùng một file.

## Decision

Sửa bằng cờ `auth.reconnect` đã có sẵn thay vì đổi cách định danh `sessions` map (ví dụ thêm device-id) — rủi ro thấp hơn vì không đổi shape của registry hay handshake, chỉ thêm 1 điều kiện tại nơi quyết định có emit `session:kicked` hay không: nếu `staleSocket` tồn tại VÀ connection mới có `auth.reconnect === true`, vẫn evict socket cũ (nó đã chết hoặc sắp chết) nhưng KHÔNG emit `session:kicked` — vì đó chính là tín hiệu gây triệu chứng logout nhầm. Đăng nhập thiết bị thật (không có cờ reconnect) vẫn kick + báo như cũ.

Với bug `wrappedOn`, chọn loại trừ event `'disconnect'` khỏi bước coerce payload (thay vì bỏ hẳn wrapper cho toàn bộ event đó) để vẫn giữ nguyên phần try/catch bảo vệ lỗi cho listener disconnect.

## Summary output

Sửa [server/socket/SocketHandler.js](server/socket/SocketHandler.js): (1) L97-117 — chỉ emit `session:kicked` khi connection mới KHÔNG mang cờ `auth.reconnect`; (2) L119-138 — loại `'disconnect'` khỏi payload-coercion trong `wrappedOn` để reason string không bị ép thành object rỗng. Thêm 3 test case mới vào [server/tests/SocketHandler.test.js](server/tests/SocketHandler.test.js) (giữ nguyên toàn bộ test cũ, không xoá case nào): reconnect cùng tab (`auth.reconnect: true`) evict socket cũ nhưng không emit `session:kicked`; đăng nhập thiết bị thật (không cờ) vẫn emit `session:kicked` như cũ; disconnect reason string đến log nguyên vẹn, không còn `[object Object]`. `npm test`: 511/511 xanh, không hồi quy. Branch `fix/session-kick-false-positive-on-reconnect` off `main`, chưa merge — chờ merge theo quy trình "one fix, one branch, one commit" sau khi user xác nhận.
