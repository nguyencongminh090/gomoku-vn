# #126 — Thêm `modulepreload` cho ES module — ⚠️ đo trên domain thật qua Cloudflare Tunnel, cần cách ly nghiêm ngặt

**Trạng thái:** chưa làm — **làm SAU CÙNG**, sau #122/#123/#124/#125 và mọi việc khác đang mở.

**Nguồn:** review vòng 4 (`gomoku-vn-review-2026-08-14.md` mục 13.6/13.12 #4).

## Vấn đề

Không có hint `modulepreload`/`preload` nào trong 4 trang HTML thật:

```
room.html : 11 ES module / 66 840 B  nằm sau rào cản parse
index.html:  7 ES module / 45 646 B  nằm sau rào cản parse
```

Trình duyệt không biết các module này tồn tại cho tới khi tải **và parse xong**
`room-entry.js`/`index-entry.js` — 2 tầng tuần tự thay vì 1.

## ⚠️ Vì sao mục này CẦN BẢO VỆ NGHIÊM NGẶT hơn #122-#125

Người dùng đang dùng **Cloudflare Tunnel forward từ localhost thật của máy mình** ra domain
`play3cr.dpdns.org` — tức máy dev và "production" là **cùng một máy, cùng một tiến trình**, không
tách biệt. Khác với #122-#125 (thay đổi nhỏ, rủi ro thấp, dễ revert), việc này có 2 đặc điểm nguy
hiểm hơn cộng lại:

1. **Đo đạc bắt buộc phải qua HTTPS/HTTP2 thật** (không phải localhost — xem cảnh báo của vcaro
   trong review 13.6: HTTP/1.1 localhost giới hạn 6 connection sẽ che mất khác biệt, tối ưu từng
   suýt bị gỡ nhầm vì đo sai chỗ). Nghĩa là **phép đo hợp lệ duy nhất lại đi qua đúng domain thật
   mà người dùng thật/traffic thật cũng đang dùng** — không có môi trường staging tách biệt.
2. **Bẫy hint thiếu/sai không báo lỗi** — nó khiến file bị tải **2 lần** (review đo được ví dụ thực
   tế 238→917ms ở dự án tham chiếu vcaro). Nếu làm sai mà không phát hiện kịp, người chơi thật đang
   vào phòng qua tunnel sẽ chịu hiệu năng tệ hơn trước, không phải tốt hơn.

## Yêu cầu bắt buộc trước khi làm (không được bỏ qua)

- **Cách ly (isolate):** không sửa trực tiếp trên working tree đang được tunnel trỏ vào trong lúc
  có người chơi thật online. Làm trên branch riêng (`fix/modulepreload-hints` theo quy tắc git ở
  `git-workflow` skill), chỉ merge/deploy lúc xác nhận xong, và tránh giờ có người chơi thật nếu
  biết được.
- **Backup nguồn:** commit đầy đủ trạng thái hiện tại trước khi sửa (đã là thói quen chuẩn của repo
  — `git status` sạch trước khi bắt đầu). Nếu tunnel trỏ thẳng vào working directory đang sửa, cân
  nhắc dừng tunnel hoặc trỏ tạm sang bản backup trong lúc thử nghiệm, để không phục vụ bản dở dang
  cho người chơi thật.
- **Đo đúng cách:** qua chính domain thật (không có lựa chọn khác cho HTTP/2 thật), nhưng đo vào
  lúc traffic thấp, và đo **trước/sau** bằng cùng phương pháp (HAR 7 lần chạy lấy min/median như
  review vòng 4 đã làm — 1 lần chạy đơn lẻ là nhiễu, không phải tín hiệu, xem 13.9 của review).
- **Test canh drift:** viết test kiểu `client_preload_hints.test.js` (tham chiếu vcaro) đối chiếu
  danh sách hint với danh sách `import` thật trong `room-entry.js`/`index-entry.js`, để hint không
  lệch âm thầm về sau khi thêm/bớt module.
- **Rollback sẵn sàng:** giữ commit trước đó dễ revert nếu phát hiện double-load hoặc icon/module
  lỗi sau khi lên domain thật.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Hiệu quả:** gỡ rào cản tuần tự 66 840 B/11 module (phòng), 45 646 B/7 module (sảnh) — chưa đo
  được số mili-giây cụ thể tiết kiệm, cần A/B thật qua HTTP/2.
- **Rủi ro:** **trung bình-cao hơn** #122-#125 do đo đạc phải chạm domain thật + bẫy double-load
  không báo lỗi. Đây là lý do làm SAU CÙNG trong danh sách.

Chi tiết thực thi: [docs/instruction/B126-modulepreload-cho-es-module-do-tren-domain-that-qua-tunnel.md](../instruction/B126-modulepreload-cho-es-module-do-tren-domain-that-qua-tunnel.md).
