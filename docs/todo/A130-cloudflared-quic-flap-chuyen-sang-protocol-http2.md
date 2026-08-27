# #130 — Tunnel `cloudflared` re-register 19 lần/3 ngày — ĐÃ LOẠI TRỪ, không phải nguyên nhân site chậm

**Trạng thái:** ✅ Đã đóng — điều tra xong, **không phải lỗi**. Còn lại 1 việc bảo trì không gấp
(nâng version `cloudflared`). Giữ lại làm bản ghi âm tính.

**Nguồn:** phân tích 2 file HAR do người dùng cung cấp (`play3cr.dpdns.org_Archive
[26-08-19 20-48-23].har` và `[26-08-19 20-49-17].har`, page load `room.html?id=#JGY` lúc
2026-08-19 20:47:48 +07), kèm đo trực tiếp metrics `cloudflared` và tiến trình server cùng thời
điểm. Bối cảnh người dùng nêu: "CPU ran for 2 day, server ran long time, connection looks slow,
available players playing, do not stop server".

## Triệu chứng đo được trong HAR

Toàn bộ page load HTTP khoẻ mạnh — không có gì để sửa ở tầng này:

| Chỉ số | Giá trị |
|---|---|
| `onContentLoad` / `onLoad` | 323 ms / **504 ms** |
| `room.html` | 304, `wait=149ms`, `server-timing: cfEdge;dur=14, cfOrigin;dur=63` |
| 27 asset CSS/JS/SVG | `time=0ms`, **toàn bộ từ cache** (`?v=130` immutable đang hoạt động đúng) |

Chỉ có **2 entry chậm trong cả HAR**, và cả hai đều là `wss://play3cr.dpdns.org/socket.io/`:

```
WS#1  20:47:48.873  blocked=44616  connect=7196  ssl=121  wait=143   → 101 lúc 20:48:40  (52.0s)
WS#2  20:48:09.850  blocked=0      connect=1083  ssl=418  wait=1388  → 101 lúc 20:48:12  ( 2.9s)
```

Diễn biến thật:

1. `20:47:48.873` — socket.io mở WS#1 (websocket-first theo `socket-client.js`). Kẹt.
2. `20:48:08.9` — hết `timeout` mặc định 20 000 ms của socket.io-client → huỷ, `reconnect_attempt`.
3. `20:48:09.85` — WS#2 mất 2.9 s → **kết nối thật sự thành công lúc 20:48:12.7**.
4. `20:48:40.7` — WS#1 (đã bị bỏ) mới được edge trả 101, muộn 28 s.

→ **Người chơi đứng ở "Đang kết nối…" khoảng 24 giây** trước khi phòng dùng được.

## Vì sao KHÔNG phải lỗi server Node (đã loại trừ, đừng điều tra lại)

Đo trực tiếp lúc 21:01 cùng ngày, server vẫn đang chạy (không restart theo yêu cầu người dùng):

```
PID 37274  node server/index.js   uptime 2d15h39m   CPU time tổng cộng 00:00:10   RSS 113 MB
load average: 0.23 0.60 1.20
```

**10 giây CPU trong 2,6 ngày.** "CPU ran for 2 days" trong báo cáo là *uptime máy*, không phải tải.
Không có dấu hiệu rò rỉ bộ nhớ hay nghẽn event loop. Cộng với `cfOrigin;dur=63` ở trên: origin trả
HTML trong 63 ms. **Restart server không sửa được gì ở đây.**

Cũng đã loại trừ tầng auth ứng dụng: `wait=1388ms` của WS#2 xảy ra *trước* khi
`io.use(verifySocketToken)` chạy — engine.io trả 101 rồi socket.io middleware mới chạy sau — nên
1.4 s đó không phải chi phí tra session/DB.

## Tunnel: đã kiểm tra và LOẠI TRỪ (đừng điều tra lại)

Giả thuyết ban đầu khi mới đọc metrics là tunnel flap do mất gói UDP/QUIC phía nhà. **Log
`journalctl -u cloudflared` bác bỏ giả thuyết đó** — ghi lại đây để không ai đi lại đường này:

```
ERR failed to accept incoming stream requests
    error="failed to accept QUIC stream: Application error 0x0 (remote)"
INF Retrying connection in up to 1s
INF Registered tunnel connection connIndex=1 ... location=sin22 protocol=quic
```

- `(remote)` ⇒ **Cloudflare edge chủ động đóng**, không phải máy nhà. `0x0` là mã đóng **bình
  thường**, không phải lỗi — edge xoay vòng/bảo trì connection.
- Mỗi lần chỉ rụng **1 trong 4** connection; 3 cái còn lại vẫn phục vụ. Nối lại sau **1–14 giây**.
  Không có cửa sổ nào tunnel mất hoàn toàn ⇒ **người chơi không bị ảnh hưởng**.
- Tần suất: các lần ghi nhận 2026-08-19 lúc 07:49, 08:21, 08:38, 08:47 (giờ máy). **Lần gần nhất
  cách thời điểm chụp HAR (20:47) đúng 12 tiếng** ⇒ lúc site chậm, tunnel đang hoàn toàn ổn định.

⇒ Con số `registerConnection=19` chỉ là **bộ đếm tích luỹ theo uptime** (~6 lần/ngày, toàn bộ do
edge đóng bình thường), **không phải** dấu hiệu hỏng hóc, và **không phải** hệ quả của việc chạy
lâu. Restart `cloudflared` chỉ reset bộ đếm về 4 rồi tăng lại như cũ — không sửa gì.

## Phần thật sự gây chậm (không nằm ở tunnel)

Bóc 24 giây người chơi phải chờ:

| Đoạn | Thời gian | Thuộc về |
|---|---|---|
| `blocked=44616` + `connect=7196` (WS#1) | ~52 s | **Trình duyệt ↔ Cloudflare edge** — nằm *trước* tunnel |
| Hết `timeout` 20 000 ms rồi mới retry | 20 s | **Code client** → TODO.md #131 |
| `wait=1388ms` (WS#2) | 1.4 s | Edge → tunnel → origin |

`connect=7196ms` / `1083ms` đúng dạng SYN retransmit (1+2+4 s và 1 s), trong khi `room.html` có
`connect=0` vì tái dùng connection HTTP/2 đã mở ⇒ **kết nối đã mở thì tốt, mở kết nối mới thì mất
gói**, ở chặng máy người chơi ↔ edge. Đây là chặng **không kiểm soát được từ phía server**.

Phần còn lại chưa giải thích được: `wait=1388ms` cho WS upgrade so với `cfOrigin;dur=63ms` cho HTML.
Chiếm 1.4/24 giây nên không phải ưu tiên, nhưng nếu muốn truy thì đo lại chính con số này, đừng đo
lại tunnel register.

## Việc cần làm

**Hạ ưu tiên sau khi đọc log** — mục này không còn là "sửa lỗi", chỉ còn là bảo trì:

1. Nâng `cloudflared` 2026.7.3 → 2026.8.2 (log tự cảnh báo outdated). **✅ ĐÃ LÀM 2026-08-19 23:56** (người dùng tự chạy phần
   `sudo`; agent tải + verify binary và xác minh sau khi cài). Baseline trước khi nâng đã ghi bên dưới.

   **Baseline 2026-08-19 23:5x (uptime 3d02h, trước khi nâng):**
   `registerConnection=19`, `quic_client_closed_connections=16`,
   `dropped_packets{initial,key_unavailable}=2560`, `lost_packets{timeout}=5/4/4/2`,
   `ha_connections=4`, `total_requests=1588`. Sau khi nâng, đọc lại đúng 4 chỉ số này để so **theo
   tỉ lệ trên đơn vị thời gian**, không so số tuyệt đối (bộ đếm reset về 0 khi restart).

   Lưu ý: có **hai** binary, `/usr/bin/cloudflared` (systemd `ExecStart` dùng cái này) và
   `/usr/local/bin/cloudflared` (`which` tìm thấy cái này) — cả hai đều 2026.7.3. Thay cả hai cho
   khỏi lệch phiên bản về sau.
2. **Không** đổi sang `--protocol http2` chỉ vì con số 19 — đã chứng minh đó là đóng bình thường
   phía edge. Chỉ cân nhắc nếu sau này thấy `Application error` với mã **khác 0x0**, hoặc thấy đứt
   **cả 4** connection cùng lúc, hoặc đứt trùng đúng thời điểm người chơi báo rớt.
3. ~~Phụ: áp lực bộ nhớ có thể gây spike độ trễ cho `cloudflared`~~ — **ĐÃ ĐO 2026-08-19, GIẢ
   THUYẾT SAI, đóng mục này.** Đo `VmSwap` trực tiếp từng tiến trình:

   | Tiến trình | RSS | Swap |
   |---|---|---|
   | `cloudflared` (pid 1590) | 47.9 MB | **2.6 MB** |
   | `node server/index.js` (pid 37274) | 118.4 MB | **14.4 MB** |

   Cả hai gần như không bị swap ⇒ áp lực bộ nhớ **không chạm tới** đường phục vụ. 3.3 GB swap là
   của desktop: Firefox ~4.5 GB RSS, Antigravity IDE ~3.2 GB, KDE ~1.7 GB, node/claude ~2.0 GB.
   Không có việc gì cần làm cho server; muốn lấy lại RAM thì đóng bớt tab/IDE, thuần desktop.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Hiệu quả:** ~0 cho vấn đề đã báo cáo. Giả thuyết ban đầu (tunnel flap gây chậm) **đã bị log bác
  bỏ** — xem mục "đã kiểm tra và LOẠI TRỪ" ở trên. Giữ mục này lại làm bản ghi âm tính, để lần sau
  không ai điều tra lại từ đầu.
- **An toàn:** http2 là chế độ được Cloudflare hỗ trợ chính thức, không đổi hành vi ứng dụng.
  Rủi ro duy nhất là **restart `cloudflared` làm rớt toàn bộ người chơi vài giây** → chỉ làm khi
  không có ai trong phòng.
- **Không đụng tới:** `server/index.js`, cấu hình socket.io phía server, `?v=` — việc này thuần hạ tầng.

## Ghi chú phạm vi

HAR của Firefox không lưu WebSocket frame (`_webSocketMessages` không có), nên **không đo được độ
trễ nước đi trong ván** từ 2 file này. Nếu cần con số đó phải đo phía server hoặc chụp lại có bật
ghi frame — đừng suy ra từ HAR hiện tại.

## Kết quả nâng `cloudflared` — 2026-08-19 23:56

Cài `2026.7.3` → `2026.8.2` trên **cả hai** đường dẫn (`/usr/bin`, `/usr/local/bin`), backup
`/usr/bin/cloudflared.2026.7.3.bak` còn nguyên để rollback. Restart lúc lobby trống.

Xác minh ngay sau restart:

| Kiểm tra | Kết quả |
|---|---|
| `--version` cả 2 binary | `2026.8.2 (built 2026-08-14)` |
| `systemctl is-active` | `active`, MainPID mới 571356 |
| Đăng ký lại tunnel | **4/4 connection trong 3 giây** (23:56:33→36), sin15/sin21/sin14/sin20 |
| `/ready` | `{"status":200,"readyConnections":4}` |
| `registerConnection` | 4 (baseline sạch, bộ đếm reset) |
| Site qua tunnel | HTTP 200, tcp=56 ms, tls=120 ms, ttfb=253 ms |
| `node server/index.js` | **không restart**, uptime liên tục 2d18h — đúng phạm vi "KHÔNG làm" |

### ⚠️ Không quy công cho bản nâng — mạng đã tự hồi phục cùng lúc

Đo lại 12 lần bắt tay WebSocket sau khi nâng: **12/12 thành công, median 256 ms, max 1293 ms**
(trước: 11/12, median 5074 ms, max 7948 ms). Nhìn qua tưởng bản nâng có công.

**Không phải.** Kiểm tra tầng dưới ngay sau đó: `mtr -c 30 1.1.1.1` giờ **0% loss toàn tuyến**, và
TCP connect tới Google/GitHub/Cloudflare đều đều 35–55 ms, không còn bậc SYN retransmit nào. Tức
**đợt mất gói ~17% của nhà mạng đã tự hết** trong khoảng 22:00→23:56, cùng cửa sổ với lần nâng.

⇒ Cải thiện là do **mạng hồi phục**, không phải do `cloudflared` mới. Bản nâng đúng như dự đoán ban
đầu: **bảo trì thuần, hiệu quả ~0** với triệu chứng đã báo cáo. Ghi lại để lần sau không ai đọc cặp
số 5074→256 rồi kết luận sai nhân quả.

### Hệ quả cho TODO.md #131

Đợt mất gói là **tạm thời** (giờ cao điểm tối), không phải hỏng cố định của nhà mạng. Muốn khiếu nại
ISP thì phải đo lại đúng khung giờ đó, không đo lúc mạng đang tốt. `timeout: 12000` vẫn giữ nguyên —
nó chỉ có tác dụng lúc mạng xấu, đúng lúc cần, và vô hại lúc mạng tốt (bắt tay 240–1293 ms).
