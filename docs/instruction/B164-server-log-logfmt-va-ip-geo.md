# B164 — Log logfmt + IP/geo

**Việc:** (1) `logger` xuất dòng `key=value` parse được; (2) gắn IP thật + nhãn
geo vào log kết nối / auth.

**Cách làm (đã thực hiện):**
1. `server/utils/logger.js`: thêm `LOG_FORMAT=pretty|logfmt|auto` (mặc định
   `auto` = pretty khi TTY, logfmt khi không). Đối số cuối là plain object →
   structured fields → `k=v` logfmt-quote. Giữ chữ ký `debug/info/warn/error`
   để KHÔNG phải sửa ~91 call site.
2. `server/utils/geo.js` (mới): chỉ đọc header Cloudflare (`CF-IPCountry` +
   tuỳ chọn city/region/asn), KHÔNG thêm dependency GeoIP. `formatGeo` →
   `local` / `-` / `VN` / `VN/Hanoi`. Dùng lại `resolveClientIp` +
   `getClientIpFromReq`.
3. `server/middleware/accessLog.js` (mới): tắt mặc định, bật bằng
   `LOG_HTTP=true`. Mount sau `express.json()` trong `index.js`.
4. Wire `{ ip, geo }` vào `SocketHandler` (connect/disconnect),
   `middleware/auth.js` (4 warn handshake), `routes/auth.js` (login/register/
   guest/google) qua helper `clientLoc(req)`.

**Pitfalls:**
- KHÔNG bump `?v=N` (server-only).
- `CF-IPCountry` có thể là `XX`/`T1` — đã chuẩn hoá về null.
- Test cũ `SocketHandler.test.js` assert `reason=...` trong chuỗi nội suy — đã
  chuyển reason sang fields bag, sửa case sang đọc object.
- Không log token/cookie/mật khẩu vào fields.

**Test:** `server/tests/geo.test.js` + `server/tests/logger.test.js` (mới);
`npm test` 1452/1452.

[chi tiết todo](../todo/B164-server-log-logfmt-va-ip-geo.md)
