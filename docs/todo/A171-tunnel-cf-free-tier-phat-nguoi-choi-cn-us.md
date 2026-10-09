# #171 — (Khảo sát hạ tầng) Cloudflare Tunnel + gói free + origin tự-host có phạt tốc độ người chơi CN/US không

**Trạng thái:** ✅ Đã đóng — **đã đo (2026-08-29), hoãn triển khai theo quyết định người dùng.**
Nguyên nhân đã xác định rõ (đuôi cố định ~140 ms + jitter do `cloudflared` chạy trên ADSL dân dụng
VN — xem "Kết quả đo lần 1"). Người dùng đang pre-revenue, **không có thẻ tín dụng** ⇒ không dùng
được cả free-tier cần xác minh thẻ (Oracle/AWS/GCP). **Quyết định 2026-08-29: giữ nguyên setup hiện
tại, chấp nhận đánh đổi**, xem lại khi có nhiều người chơi / có ngân sách. Đây là **đánh đổi có chủ
đích, đã ghi nhận** — không phải bug tồn đọng. Phần *cảm giác* lag do đuôi này gây ra được xử lý ở
tầng code qua #167 + #169 ($0).

Câu hỏi kiến trúc, **không sửa được bằng code game**.

**Nguồn:** người dùng hỏi 2026-08-29 — "Cloudflare Tunnel & domain `.dpdns.org` có làm chậm tốc độ
truy cập / tốc độ chơi timer (#165–#170) của user ở China / US (VPN) không? Có site khác đảm bảo
tốc độ người chơi tốt hơn site của chúng ta."

**Liên quan trực tiếp:** #130 (đã loại trừ *tunnel flap* là nguyên nhân của một sự cố chậm cụ thể —
xem `docs/todo/A130-*.md`; mục này hỏi câu **khác**: kiến trúc tunnel + free-tier có phạt *nền*
mọi phiên CN/US không), #165/#166/#167/#169/#170 (các bug tầng hiển thị/refund giờ mà RTT cao làm
lộ), #131 (timeout socket.io-client khi mất gói SYN).

---

## Giả thuyết cần kiểm chứng (KHÔNG coi là đã đúng cho tới khi có số)

1. **Chặng thừa của Tunnel.** Đường đi thật:
   `player → PoP Cloudflare gần player → backbone CF → PoP gần origin → tiến trình cloudflared →
   localhost:3000`. Một origin có IP public sau proxy CF (cam) **không** có chặng `cloudflared`.
   `cloudflared` giữ kết nối outbound QUIC/HTTP2 tới 2 datacenter CF gần **origin** (hiện quan sát
   được: `sin*` — Singapore, xem A130). Nếu origin nằm trên đường truyền dân dụng ở VN thì mọi
   request đều thừa hưởng jitter/loss của uplink đó.
2. **Không có Argo Smart Routing.** Gói free ⇒ chặng edge→origin đi định tuyến Internet công cộng,
   không phải backbone tối ưu của CF. Chặng "PoP CN → origin VN" có thể đi đường nghẽn.
3. **Trung Quốc: không có PoP đại lục.** Gói free/Pro của Cloudflare không phục vụ từ trong đại lục;
   user CN bị route sang HK/LA/San Jose/Tokyo/Singapore, link xuyên biên giới bị GFW throttle + nghẽn.
   Khớp với mẫu `/diag` #5 (`wbcplayer`, CN/3g): half-RTT p50 **376ms** / p90 **659ms**, jitter
   **199,6ms** — trong khi 4 mẫu VN cùng ngày là ~55ms / jitter 1,7–15,9ms. CF China Network cần
   Enterprise + giấy phép ICP ⇒ ngoài tầm.
4. **US qua VPN.** VPN thêm một vòng (user → exit VPN → PoP CF gần exit → tunnel → origin VN). Ngay
   cả đường US↔VN peering tốt cũng ~180–220ms RTT tối thiểu do khoảng cách + cáp xuyên TBD; Tunnel
   cộng thêm ~10–40ms và jitter. Phần này **không giảm được bằng đổi hạ tầng CF** — chỉ giảm được
   bằng đặt origin gần US, hoặc bằng #167 (refund giờ thật) + #169 (làm mượt hiển thị).
5. **Tên miền `.dpdns.org`: KHÔNG phải yếu tố tốc độ.** Chỉ là CNAME trỏ vào Cloudflare; sau lần
   resolve DNS đầu tiên không tốn thêm gì. Rủi ro của free dynamic-DNS là *độ tin cậy* (suspend /
   rate-limit NS), không phải độ trễ. Loại khỏi phạm vi khảo sát này trừ khi đo DNS cho thấy khác.

---

## Bước 1 — ĐO trước (bắt buộc, theo rule "đừng chọn số tròn" / "root-cause diagnosis")

Mục tiêu: tách 24× thời gian một request/round-trip thành 3 phần **distance (không giảm được)** vs
**overhead tunnel** vs **định tuyến edge→origin trên free-tier**, để biết đổi hạ tầng có đáng không.

### 1a. Thu thêm mẫu `/diag` từ CN/US

Kênh `/diag` (#168) đã dựng. Hiện mới **1 mẫu** ở dải RTT cao (CN). Cần ≥ 3–5 mẫu CN và ≥ 3–5 mẫu
US+VPN, ghi rõ `geo`, `navigator.connection`, có/không VPN (trường `feedback`). Đây cũng là điều
kiện còn thiếu để mở Bước 2 của #167.

### 1b. Đo từ máy origin (không cần người chơi)

Chạy trên box đang chạy `cloudflared` + `node server/index.js`:

- `mtr -c 100 -r <đích CN>` và `mtr -c 100 -r <đích US-west>` — xem loss/jitter theo hop, xác định
  chặng xấu nằm ở uplink nhà hay ở transit.
- `traceroute` tới cùng 2 đích để thấy origin's ISP đi qua đâu ra quốc tế.

### 1c. So 3 đường tới cùng một tài nguyên tĩnh nhỏ (vd `/healthz` hoặc `/favicon`)

Từ **một máy đo đặt ở US và một ở CN** (VPS thuê theo giờ, hoặc nhờ người chơi chạy `curl`):

| Đường | Cách dựng | Đo |
|---|---|---|
| (a) qua hostname tunnel hiện tại | `curl -w` tới `https://play3cr.dpdns.org/...` | `time_appconnect`, `time_starttransfer`, `time_total` × 20 |
| (b) thẳng origin, bỏ CF | bản ghi DNS tạm `origin-direct.<domain>` **grey-cloud** (DNS-only) trỏ IP public origin, hoặc `curl --resolve` | cùng bộ số |
| (c) origin sau proxy CF, không tunnel | bản ghi tạm **orange-cloud** trỏ IP public origin | cùng bộ số |

Diễn giải:
- (a) − (c) ≈ **chi phí thuần của chặng `cloudflared`** (nếu (c) khả thi về mặt reachability/TLS).
- (a) − (b) ≈ **tổng chi phí toàn bộ tầng Cloudflare** (edge + routing + tunnel) so với đi thẳng.
- (b) một mình ≈ **distance floor** — phần không hạ tầng nào của ta sửa được.

⚠️ Nếu đo lúc mạng nhà đang có đợt mất gói (xem A130: đợt ~17% loss tự đến/tự đi theo giờ cao điểm)
thì **mọi con số vô nghĩa** — chạy `mtr -c 30 1.1.1.1` từ origin ngay trước/sau mỗi đợt đo, chỉ giữ
các đợt có 0% loss toàn tuyến. Lặp đo ở 2–3 khung giờ khác nhau.

### 1d. HAR trong ván thật (nếu người chơi hợp tác)

HAR Firefox **không** lưu WS frame (A130 ghi chú) ⇒ để đo độ trễ *nước đi trong ván* phải bật ghi
frame khi chụp, hoặc lấy từ log server (`msg="[MoveLag]"` — harness #167, bật bằng `LOG_MOVE_LAG=true`).

---

## Bước 2 — Bảng quyết định (chỉ điền sau khi có số Bước 1)

| Phương án | Chi phí | Sửa được gì | KHÔNG sửa được | Rủi ro |
|---|---|---|---|---|
| **Giữ nguyên + chấp nhận** | 0 | — | tất cả | người chơi CN/US tiếp tục phàn nàn |
| **Chuyển origin sang VPS cloud (Singapore hoặc US-west), transit tốt** | ~vài $/tháng | bỏ jitter uplink dân dụng; rút ngắn mạnh chặng US/CN↔origin | GFW↔edge với CN | phải migrate SQLite + `.env` + `cloudflared`/DNS; downtime 1 lần |
| **Giữ tunnel, đặt `cloudflared` cạnh origin cloud** | như trên | như trên | như trên | như trên |
| **Bỏ tunnel, IP public sau proxy CF (cam)** | 0–ít | bỏ chặng `cloudflared` | routing free-tier; GFW; distance | box phải reachable + CF-proxy-safe; lộ diện tấn công cổng; đụng `getClientIp`/`trust proxy` (đã theo `CF-Connecting-IP`, xem #44 — kiểm lại) |
| **Cloudflare Argo Smart Routing** | ~$5/th + usage | tối ưu edge→origin đường dài | không có PoP CN | phụ thuộc thêm dịch vụ trả phí |
| **Ship #167 (refund bounded) + hoàn tất tinh chỉnh #169** | code, đã có task | phần *bất công* + phần lớn *cảm giác* lag | gói tin không nhanh hơn | xem spec an toàn #167 |

**Nguyên tắc:** phần "distance floor" (Bước 1c-(b)) là không giảm được — nếu nó đã chiếm gần hết
thời gian người chơi CN/US thấy, thì đổi hạ tầng CF cho ít giá trị và ưu tiên dồn về #167/#169
(tầng game). Nếu (a)−(c) hoặc (a)−(b) lớn, thì đổi chỗ đặt origin / bỏ tunnel là đáng.

---

## Ngoài phạm vi (cố ý tách)

- **Bug tầng hiển thị/refund giờ** khi RTT cao — #165/#166/#169 (hiển thị), #167 (giờ thật server),
  #170 (lệch `Date.now()`). Mục này *không* chồng lấn: nó hỏi mạng có nhanh lên được không, các mục
  kia làm cho độ trễ *còn lại* bớt khó chịu.
- **`cloudflared` re-register / QUIC flap** — #130, đã điều tra xong, không phải lỗi.
- **`timeout` socket.io-client khi mất gói SYN** — #131.
- **`ETag` bị CF nén lại xoá** — #125.
- **Đổi tên miền** — không phải yếu tố tốc độ; chỉ mở task riêng nếu lo độ tin cậy của free DNS.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa đo)

- **Hiệu quả:** chưa biết — chính là thứ Bước 1 phải đo. Giả thuyết mạnh nhất: phần lớn độ trễ
  CN/US là *distance + GFW*, không giảm được bằng đổi cấu hình CF; phần *giảm được* là jitter uplink
  dân dụng (đổi origin sang cloud) và chặng `cloudflared` thừa (bỏ tunnel).
- **An toàn:** mọi phương án đều là thay đổi hạ tầng có downtime 1 lần và cần kiểm lại
  `getClientIp`/`trust proxy`/CSWSH allow-list (`CORS_ORIGIN`) sau khi đổi. **Không đụng** code
  game, socket.io server config, `?v=`.
- **Không quy công nhân quả từ 1 lần đo** (bài học A130: cặp số 5074→256ms từng suýt bị quy sai cho
  bản nâng `cloudflared`, thực ra do mạng tự hồi phục). Mọi so sánh phải kèm `mtr` nền cùng thời điểm.

---

## Kết quả đo lần 1 — phía origin, link nhàn rỗi (2026-08-29)

Đo từ **chính máy origin**. `mtr -r -c 20 1.1.1.1` ngay trước/sau: **0% loss toàn tuyến** ⇒ cửa sổ
đo sạch (khác đợt mất gói ~17% trong A130).

### Hạ tầng thực tế (xác minh, không còn là giả định)

| Thành phần | Giá trị đo được |
|---|---|
| Origin | Laptop **HP ProBook** tại nhà (`ngmint-HP-ProBook`), Node trên `:3000` |
| Đường truyền origin | **Viettel ADSL dân dụng**, IP public `115.76.51.2` (`dynamic-ip-adsl.viettel.vn`) |
| Last-mile ADSL | **~34–40 ms** một chiều chỉ riêng chặng modem→PoP Viettel (hop 8→9 trong `mtr`: 6 ms → 50 ms) |
| `cloudflared` | 2026.8.2, **token dashboard-managed**, protocol **QUIC**, tới `region1/2.v2.argotunnel.com` |
| PoP Cloudflare phục vụ box | **SIN (Singapore)** — `/cdn-cgi/trace` → `colo=SIN`, khớp tên connection `sin*` ở A130 |
| DNS | `play3cr.dpdns.org` → NS `*.ns.cloudflare.com`, A `172.67.150.225` / `104.21.11.251` (proxied cam) |
| Argo Smart Routing | **Không bật** (gói free) |

### "Thuế tunnel" — đo trực tiếp, client = chính máy origin

`curl` từ origin box, 20 mẫu, link nhàn rỗi:

| Đích | TTFB |
|---|---|
| `http://localhost:3000/` | **~2 ms** (min 1,0 / max 3,1) |
| `https://play3cr.dpdns.org/` (qua tunnel) | **p50 263 / p90 297 / max 635 ms**, mean 280, spread **409 ms** |

Bóc tách một request qua tunnel (mẫu điển hình): `tcp_connect` 60 ms → `tls_done` 140 ms →
**`ttfb` 280 ms**. Tức **~130–150 ms** trôi qua giữa "TLS xong" và "byte đầu tiên" — đó là quãng
`SIN edge → SIN argotunnel → cloudflared (đang chạy trên box VN, qua ADSL) → localhost:3000 → quay
về`.

### Ba kết luận sơ bộ (mạnh)

1. **App không phải thủ phạm — tuyệt đối không.** localhost TTFB ~2 ms. Mọi độ trễ nằm ở tầng mạng.

2. **Kiến trúc tunnel bắt MỌI request đi qua ADSL dân dụng VN — và đi qua *hai lần*.**
   `cloudflared` chạy trên box VN nhưng nối ra SIN. Đường của một request user bất kỳ:
   `user → PoP CF gần user → backbone CF → SIN argotunnel → **xuống ADSL Viettel** → cloudflared →
   localhost`. Chặng "SIN → ADSL → box VN → về" là **~130–150 ms cố định**, **giống hệt cho mọi
   user bất kể ở đâu**, vì nó neo vào chỗ `cloudflared` sống (ADSL nhà ở VN), không neo vào vị trí
   user. Tunnel **không** tiết kiệm chặng ADSL — nó **nhân đôi** chặng đó.
   - Ngân sách một user: `RTT tới PoP CF` + `backbone CF → SIN` + **~140 ms đuôi cố định về ADSL VN**.
   - Người chơi CN (`/diag` #5): half-RTT p50 376 ms — cộng đuôi 140 ms ⇒ mỗi round-trip nước đi
     ~0,9–1,5 s, khớp `moveConfirm.p50 = 891 ms` đã đo.

3. **Jitter đuôi cố định đã ~400 ms spread ngay ở điều kiện tốt nhất** (localhost, link nhàn rỗi:
   p50 263 → max 635). Đây chính là nguồn jitter mà #169 đang chống ở tầng hiển thị — và user CN/US
   cộng thêm RTT quốc tế + bufferbloat ADSL lúc có tải lên trần.

### Phương án & ước lượng lợi ích (sơ bộ)

| Phương án | Đuôi cố định sau khi đổi | Ghi chú |
|---|---|---|
| **Giữ nguyên** | ~140 ms + jitter ADSL | mọi user, mọi lúc |
| **Origin = VPS Singapore, IP public sau proxy CF (bỏ tunnel)** | **~1–5 ms** | edge SIN + origin SIN cùng thành phố; bỏ hẳn ADSL + bỏ nhân đôi. **~130 ms/round-trip cho MỌI user**, lớn hơn với CN/US. Bỏ luôn jitter ADSL. |
| **Origin = VPS Singapore, giữ tunnel** | ~10–30 ms | vẫn hơn nhiều so với hôm nay; giữ ẩn IP/DDoS của tunnel |
| **Argo Smart Routing (giữ mọi thứ khác)** | ~140 ms (không đổi đuôi) | chỉ tối ưu user→edge→SIN, **không** đụng đuôi ADSL — lợi ích nhỏ ở đây |
| **Chỉ dồn về #167 + #169** | ~140 ms (không đổi) | không làm gói nhanh hơn; chỉ giảm *bất công* + *cảm giác* |

**Hướng nghiêng rõ:** đuôi cố định ~140 ms + jitter ADSL là phần **giảm được nhiều nhất và rẻ
nhất** bằng cách chuyển origin sang một VPS ở Singapore (nơi CF đã route tới). Distance floor
CN/US↔SIN thì không đổi, nhưng ta bỏ được nguyên khối 140 ms mà hôm nay mọi người phải trả.

### Chưa làm được (cần nguồn lực ngoài)

- **Đo từ vantage CN + US thật** (bảng 1c: qua tunnel / thẳng origin DNS-only / origin sau proxy CF
  không tunnel). Cần VPS thuê giờ ở 2 vùng, hoặc người chơi chạy `curl`.
- **≥3–5 mẫu `/diag` mỗi vùng** (hiện: 1 CN, 0 US) — cũng là điều kiện mở Bước 2 của #167.
- **Độ trễ nước đi trong ván** — bật `LOG_MOVE_LAG=true` + một ván thật, hoặc HAR có ghi WS frame.
- `mtr` tới `www.baidu.com` / `mit.edu` bị CDN kéo về SIN/HK ⇒ không đo được distance thật; chỉ mẫu
  `223.5.5.5` (AliDNS, đại lục thật) hữu ích: VN→CN-đại-lục **~115 ms + path lossy** (China Unicom 169).

### Ghi chú nhân quả (bài học A130)

Mọi số trên đo trong **một** cửa sổ link sạch. `max 635 ms` là **một** spike trong 20 mẫu — chưa đủ
để đặc tả đuôi jitter. Trước khi chốt phương án cần lặp đo ở 2–3 khung giờ + kèm `mtr` nền mỗi lần.
Con số "~130 ms lợi ích" là **ước lượng từ kiến trúc**, không phải đo A/B — xác nhận bằng cách dựng
thử VPS SIN tạm rồi đo lại chính `curl` này trước khi cam kết.

---

## Quyết định 2026-08-29 — giữ nguyên, chấp nhận đánh đổi

Người dùng: *"I'm in develop stage and have no money … no credit card … keep current project setup
and accept trade-off. When I have more users, I will think about facility."*

- **Không dựng VPS trả phí** (không ngân sách) và **không dùng được free-tier** Oracle / AWS / GCP
  (đều cần xác minh thẻ tín dụng — người dùng không có).
- Các đường $0 còn lại đều kém: GCP free chỉ region US; Fly.io free budget quá nhỏ cho SQLite +
  always-on; Render/Railway free **ngủ sau vài phút** ⇒ cold-start mỗi lần có người vào phòng.
- ⇒ **Giữ nguyên**: `cloudflared` trên laptop Viettel ADSL ở VN. Đuôi cố định ~140 ms + jitter ADSL
  là chi phí đã biết, chấp nhận ở giai đoạn này.

### Khi nào mở lại

- Có nhiều người chơi CN/US phàn nàn kèm số đo (không chỉ 1 mẫu `/diag` như hiện tại), **hoặc**
- Có ngân sách ~$5/tháng cho VPS SIN, **hoặc** có thẻ để mở Oracle Always Free (ARM SIN, $0 mãi).
- Khi mở lại: bắt đầu từ **Biến thể B** (VPS SIN + giữ tunnel, cùng token, **không sửa code**) —
  runbook đã có trong lịch sử hội thoại 2026-08-29 / có thể soạn lại vào `docs/instruction/A171-*.md`.

### Việc $0 thay thế (đã có task riêng, không thuộc mục này)

- **#167** — refund lag bounded phía server (kiểu Lichess `lag`): bỏ phần *bất công* giờ.
- **#169** — làm mượt hiển thị đồng hồ trên jitter cao: bỏ phần *trông như hỏng*.
- Hai cái này không làm gói tin nhanh hơn nhưng xử lý đúng thứ người chơi RTT cao thực sự thấy.
