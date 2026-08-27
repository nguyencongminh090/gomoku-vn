# A130 — Tunnel `cloudflared` — ĐÃ ĐIỀU TRA XONG, không phải lỗi

TODO.md #130 **đã đóng**. File này giữ lại để chặn việc điều tra lặp, không phải hướng dẫn thi công.

## Kết luận đã chốt — đừng làm lại từ đầu

- Mọi lần tunnel đứt đều là `Application error 0x0 (remote)` = **edge Cloudflare chủ động đóng, mã
  bình thường**. Không phải mất gói phía nhà, không phải lỗi cấu hình.
- Mỗi lần chỉ 1/4 connection, nối lại 1–14 s ⇒ không có gián đoạn dịch vụ.
- `registerConnection=19` là **bộ đếm tích luỹ theo uptime**, không phải triệu chứng. Restart chỉ
  reset bộ đếm.
- **KHÔNG đổi sang `--protocol http2`** dựa trên con số đó (hướng dẫn cũ ở file này đã sai và đã bị
  gỡ). Chỉ mở lại điều tra nếu: mã lỗi **khác `0x0`**, hoặc **cả 4** connection rụng cùng lúc, hoặc
  thời điểm đứt **trùng** lúc người chơi báo rớt.

## Nếu vẫn muốn kiểm tra lại (lệnh đúng, dùng log chứ đừng dùng mỗi metrics)

```
journalctl -u cloudflared --since "-3 days" --no-pager | grep -Ei "register|Connection terminated|error="
```
Metrics (`http://127.0.0.1:20241/metrics`) chỉ cho biết **bao nhiêu lần**, log mới cho biết **vì
sao** và **lúc nào** — đây chính là chỗ phân tích đầu tiên đi sai: đọc metrics rồi suy diễn nguyên
nhân mà chưa mở log.

## Việc bảo trì còn lại (không gấp)

- Nâng `cloudflared` 2026.7.3 → 2026.8.2 (log tự cảnh báo outdated). Restart `cloudflared` **làm
  rớt mọi người chơi đang online** → chỉ làm khi lobby trống.
- Dọn RAM/swap trên host (3.2 GB swap, ~1 GB trống — không phải do Node, RSS 113 MB).

## Cách xác minh phía người dùng cuối

- Chụp lại HAR trên `room.html` từ chính máy đã báo lỗi, so 2 con số duy nhất có ý nghĩa ở đây:
  `connect` và `wait` của entry `wss://.../socket.io/`. Mẫu xấu hiện tại: `connect=7196/1083`,
  `wait=1388`. Mẫu tốt kỳ vọng: `connect` < 300 ms, `wait` < 300 ms, và **chỉ có 1 entry `wss`**
  (không có lần retry thứ hai).
- Bật ghi WebSocket frame nếu muốn đo độ trễ nước đi — HAR Firefox mặc định **không** có frame, nên
  đừng cố suy ra độ trễ trong ván từ HAR cũ.

## Phạm vi KHÔNG làm

- **Không restart `node server/index.js`** như một phần của việc này — đã đo và loại trừ (10 s CPU
  trong 2,6 ngày, `cfOrigin;dur=63`). Restart chỉ làm mất trạng thái ván đang chơi mà không sửa gì.
- Không đụng cấu hình socket.io phía server (`server/index.js:165`), không bật/tắt
  `perMessageDeflate` nhân tiện — đó là TODO.md #11 riêng, có đánh đổi CPU/độ trễ riêng.
- Không đổi `?v=` (việc này không chạm file nào trong `client/`).
- Không gộp việc dọn RAM/swap (mục 3 của TODO A130) vào cùng lần đo — làm cùng lúc 2 thay đổi thì
  không quy được kết quả cho cái nào.
