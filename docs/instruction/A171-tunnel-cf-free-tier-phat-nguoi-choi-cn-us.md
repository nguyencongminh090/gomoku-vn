# A171 — Cloudflare Tunnel + free-tier có phạt người chơi CN/US không (khảo sát hạ tầng)

**Đây là khảo sát, không phải bản vá.** Kết quả là một quyết định hạ tầng.

> **ĐÃ ĐÓNG 2026-08-29 — đã đo, hoãn theo quyết định người dùng.** Nguyên nhân rõ (đuôi cố định
> ~140 ms + jitter vì `cloudflared` trên ADSL dân dụng VN). Người dùng pre-revenue, không thẻ tín
> dụng ⇒ giữ nguyên setup, chấp nhận đánh đổi. Hướng dẫn dưới đây **chỉ dùng khi mở lại** (có ngân
> sách / có thẻ / nhiều mẫu phàn nàn). Chi tiết đo + điều kiện mở lại: `docs/todo/A171-*.md`.

## Cách làm đúng

- **Đo trước khi kết luận.** Không lặp lại lỗi suýt xảy ra ở A130 (quy cặp số 5074→256ms cho bản
  nâng `cloudflared`, thực ra do mạng tự hồi phục). Mỗi lần đo phải kèm `mtr -c 30 1.1.1.1` từ
  origin cùng thời điểm; bỏ mọi đợt có loss > 0 toàn tuyến. Lặp ở 2–3 khung giờ.
- **Tách 3 phần**: distance floor (đo thẳng origin, DNS-only) vs tổng tầng Cloudflare (qua tunnel −
  đi thẳng) vs chi phí chặng `cloudflared` (qua tunnel − origin sau proxy CF không tunnel). Bảng
  1c trong `docs/todo/A171-*.md` là kế hoạch đo — theo đúng đó.
- **Metrics nói *bao nhiêu*, log nói *vì sao/lúc nào*** (bài học A130). Nếu chạm tới `cloudflared`
  thì đọc `journalctl -u cloudflared` trước khi suy luận.
- Tận dụng kênh đã có: `/diag` (#168) cho mẫu phía người chơi; `msg="[MoveLag]"` (harness #167,
  `LOG_MOVE_LAG=true`) cho độ trễ nước đi trong ván. Đừng dựng harness mới nếu cái cũ phủ được.

## Cái bẫy cụ thể

- **`.dpdns.org` không phải yếu tố tốc độ** — đừng dành thời gian đo/đổi tên miền trừ khi đo DNS
  thực sự cho thấy khác. Nếu người dùng lo, đó là task *độ tin cậy* riêng.
- **Trung Quốc**: gói free/Pro Cloudflare không có PoP đại lục — đây là giới hạn cứng, không
  "tune" được. Đừng đề xuất phương án CF-only nào hứa sửa phần CN↔edge.
- **US+VPN**: phần distance (~180–220ms US↔VN) không hạ tầng nào của ta sửa được ngoài việc đặt
  origin gần US. Nói rõ điều này, đừng để người dùng kỳ vọng tunnel config chữa được.
- **Nếu đề xuất bỏ tunnel / đổi origin**: bắt buộc kiểm lại sau khi đổi — `getClientIp()` (đang đọc
  `CF-Connecting-IP`, #44/#124), `trust proxy` (đang `'loopback'`, khớp deployment tunnel — xem
  README), CSWSH allow-list `CORS_ORIGIN`, HSTS qua đường mới (#67). Đổi origin mà quên mấy cái này
  ⇒ rate-limit/quota IP sập hoặc mọi socket handshake bị từ chối.
- **Không đo bằng 1 mẫu.** #167 đã chặn Bước 2 vì mới 1 mẫu CN — mục này cũng vậy: cần ≥ 3–5 mẫu
  mỗi vùng trước khi điền bảng quyết định.

## Ranh giới — KHÔNG đụng

- Code game, cấu hình socket.io phía server, chuỗi `?v=N` — mục này thuần hạ tầng.
- `tournament-match.js` (quyết định người dùng 2026-08-28).
- Không restart `node server/index.js` để đo (yêu cầu người dùng thường trực: có người đang chơi).
- Không tự chạy `/code-review ultra` hay thao tác `sudo` — phần `sudo`/DNS do người dùng chạy,
  agent chỉ chuẩn bị lệnh + verify.

## Chốt với người dùng trước khi làm gì hơn khảo sát

Sau Bước 1, trình bảng quyết định (`docs/todo/A171-*.md` Bước 2) và để người dùng chọn phương án.
Chỉ khi đó mới formalize thành task triển khai (có thể vẫn là task Phần A "khi deploy thật").
