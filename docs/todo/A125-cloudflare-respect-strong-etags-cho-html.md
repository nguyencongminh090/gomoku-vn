# #125 — Cloudflare xoá `ETag` của HTML — cần bật "Respect Strong ETags" trên dashboard

**Trạng thái:** chưa làm (không cần gấp)

**Nguồn:** review vòng 4 (`gomoku-vn-review-2026-08-14.md` mục 13.9b) — đã đo trên site thật qua
Cloudflare.

## Vấn đề

Origin (`server/index.js`) **có** gửi `ETag` cho HTML (đo được, trả `304` khi revalidate đúng).
Qua Cloudflare thì header `etag` **biến mất** khỏi response, chỉ còn `last-modified`. Lý do:
Cloudflare xoá `ETag` khi tự nén lại nội dung (br/gzip ở edge), trừ khi bật tuỳ chọn "Respect
Strong ETags" trong dashboard.

## Vì sao KHÔNG hỏng gì

Trình duyệt vẫn revalidate được bằng `If-Modified-Since` (đã kiểm chứng: qua Cloudflare vẫn trả
`304` đúng) — chỉ mất đi cơ chế chính xác hơn: `ETag` khớp đúng nội dung byte-for-byte, còn
`Last-Modified` chỉ tới độ chính xác giây và phụ thuộc mtime file trên origin (có thể trôi nếu
deploy bằng cách copy file thay vì giữ nguyên mtime gốc).

## Vì sao ở Phần A, không phải Phần B

Đây là **cấu hình Cloudflare dashboard**, không phải code trong repo — không có gì để sửa trong
`server/`/`client/`. Cần người có quyền truy cập dashboard Cloudflare của zone `play3cr.dpdns.org`
bật "Respect Strong ETags" (dưới Caching → Configuration, hoặc qua Cache Rules tuỳ phiên bản giao
diện Cloudflare hiện tại — kiểm tra lại tên chính xác lúc làm, giao diện Cloudflare có thể đã đổi).

## Đánh giá

- **Không gấp** — hành vi hiện tại vẫn đúng (304 hoạt động), chỉ là kém chính xác hơn mức tối ưu.
- **Không cần code, không cần branch trong repo.**
- Nếu người dùng có quyền dashboard và muốn làm: chỉ cần bật tuỳ chọn đó, không có bước nào trong
  repo đi kèm.
