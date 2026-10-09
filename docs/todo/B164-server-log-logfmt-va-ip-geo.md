# B164 — Log server: dòng parse được (logfmt) + gắn IP/geo người dùng

**Nguồn:** yêu cầu người dùng (2026-08-28), scope `start.sh`, chốt qua `AskUserQuestion`
(chọn "logfmt key=value"; nguồn geo để agent đề xuất; "implement now").

**Mô tả:** log server trước đây chỉ có `[INFO ] [HH:MM:SS] message` (chuỗi
người-đọc, không tách trường được) và không kèm IP/địa chỉ người dùng ở các
dòng kết nối / đăng nhập. Cần:
1. Định dạng dòng log **parse được** — `key=value` (logfmt).
2. Gắn **IP thật + nhãn geo** (GeoIP / Cloudflare) vào các dòng log liên quan.

**Kỳ vọng:**
- `logger` xuất được logfmt: `ts=<ISO> level=info msg="..." k=v ...`, quote/escape
  đúng khi value có dấu cách / `=` / `"`.
- Giữ được bản màu người-đọc khi chạy trong terminal (`bash start.sh`).
- Có nguồn IP→geo dùng chung, gắn vào: socket connect/disconnect, các dòng
  `[Auth]` (login/register/guest/google), handshake bị từ chối, và (tuỳ chọn)
  access-log HTTP.

**Giải pháp đã làm:**
- `server/utils/logger.js` viết lại:
  - `LOG_FORMAT=pretty|logfmt|auto` (mặc định `auto` → `pretty` khi
    `process.stdout.isTTY`, ngược lại `logfmt`). `LOG_COLOR=false` tắt màu.
  - Đối số cuối là plain object → coi là **structured fields**, nối thành
    `k=v` (logfmt-quote). Phần còn lại join khoảng trắng thành `msg`; `Error`
    đóng góp stack.
  - API `debug/info/warn/error` giữ nguyên chữ ký → 91 call site cũ không phải
    sửa. `logger._internals` expose hàm format thuần cho test.
- `server/utils/geo.js` (mới): `geoFromHeaders()` đọc `CF-IPCountry` (chuẩn hoá
  `XX`/`T1` → null), tuỳ chọn `CF-IPCity` / `CF-Region(-Code)` / `CF-ASN`.
  `formatGeo(geo, ip)` → `local` (IP loopback/RFC-1918) | `-` (không rõ) | `VN`
  | `VN/Hanoi`. `clientInfoFromReq(req)` / `clientInfoFromSocket(socket)` trả
  `{ ip, geo, geoRaw }`, dùng lại `resolveClientIp`/`getClientIpFromReq` từ
  `utils/get-client-ip.js`.
- `server/middleware/accessLog.js` (mới): access-log HTTP **tắt mặc định**, bật
  bằng `LOG_HTTP=true`. 1 dòng/response qua `logger` (nên `LOG_FORMAT` chi
  phối shape): `method path status dur_ms ip geo ua`. Mount trong
  `server/index.js` sau `express.json()`, trước static/routes.
- Wire IP/geo vào: `SocketHandler.js` (`[Socket] Connected` / `Disconnected`),
  `middleware/auth.js` (4 cảnh báo handshake bị từ chối), `routes/auth.js`
  (login / register / guest / google login / created-via-google / missing
  state) qua helper `clientLoc(req)`.

**Nguồn geo — quyết định:** dùng **header Cloudflare**, KHÔNG thêm package
GeoIP. Lý do: zone deploy đi qua Cloudflare (cùng lý do tin `CF-Connecting-IP`
cho IP thật — xem `utils/get-client-ip.js` / TODO §44), Cloudflare gắn
`CF-IPCountry` cho mọi request proxied, miễn phí, không DB phải cập nhật, không
lookup mỗi request. Đánh đổi: request KHÔNG qua Cloudflare (dev, curl trực
tiếp) không có country → log `geo=-` / `geo=local`. Muốn dữ liệu city/ASN
offline đầy đủ sau này: chỉ cần đổi `geoFromHeaders`/`formatGeo` trong
`server/utils/geo.js` (mọi call site đã đi qua module này) sang `geoip-lite` /
MaxMind — ghi thành task riêng nếu cần.

**Đánh giá hiệu quả/an toàn:** server-only, không đổi hành vi mạng. Access-log
mặc định tắt → không thêm chi phí/log ồn khi chưa bật. IP đã được xử lý an toàn
sẵn qua `resolveClientIp` (không tin XFF khi peer không phải loopback). Không
log token/cookie/mật khẩu. Rủi ro thấp.

**Bump `?v=N`:** KHÔNG — chỉ chạm `server/`.

**Unit test:**
- `server/tests/geo.test.js` (23 case): `isPrivateIp` (bảng, gồm boundary
  172.16/12), `geoFromHeaders` (case, XX/T1, city/region/asn, fallback
  `cf-region`, rỗng), `formatGeo` (private thắng, `-`, country, city > region),
  `clientInfoFromReq`/`FromSocket` (case tunnel thật, dev không header, không
  IP → `-` không throw, socket không handshake).
- `server/tests/logger.test.js` (16 case): `fmtVal` (token trần / quote+escape
  space `=` `"` / rỗng / nullish), `fmtFields` (bỏ `undefined`, khoảng trắng
  dẫn), `buildMessage` (join + unroll `Error`), `emit` logfmt (regex 1 dòng
  `ts= level= msg=`; object cuối là fields không phải msg), `emit` pretty (giữ
  prefix `[INFO ] [time]` + append fields), gating `debug` theo `DEBUG`,
  `error` → `console.error`.
- Sửa `server/tests/SocketHandler.test.js`: 1 case "reason string not coerced"
  đổi sang đọc `reason` trong fields bag (vẫn là string thô, không `[object
  Object]`).
- `npm test`: 1452/1452 pass.

**Trạng thái:** ✅ ĐÃ XONG (2026-08-28, `feature/server-log-logfmt-geoip` → `dev`).

`[Model: Sonnet 5]`
