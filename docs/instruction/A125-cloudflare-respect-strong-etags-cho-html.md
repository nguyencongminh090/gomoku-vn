# A125. Cloudflare "Respect Strong ETags" (TODO.md #125)

**Nguồn:** review vòng 4, mục 13.9b.

## Cách tiếp cận

- Đây là việc **cấu hình dashboard**, không phải sửa code — giống các mục khác trong Phần A. Không
  đụng `server/index.js`/Express — origin đã gửi `ETag` đúng, không có gì sai ở tầng code.
- Nếu người dùng có quyền truy cập Cloudflare dashboard của zone `play3cr.dpdns.org` và muốn làm:
  bật "Respect Strong ETags" trong Caching → Configuration (tên/vị trí chính xác có thể đã đổi theo
  giao diện Cloudflare hiện tại — kiểm tra lại lúc làm, không đoán).
- Xác minh sau khi bật: `curl -sI https://play3cr.dpdns.org/room.html` (hoặc trang bất kỳ) qua
  Cloudflare, kiểm tra header `etag` xuất hiện lại.

## Đừng làm

- Đừng sửa code origin dựa trên phát hiện này — `ETag` đã đúng ở tầng origin, vấn đề chỉ nằm ở
  Cloudflare tự xoá nó khi nén lại.
- Không cần gấp — `If-Modified-Since` vẫn trả `304` đúng, hành vi hiện tại không hỏng.

Xem thêm: [docs/todo/A125-cloudflare-respect-strong-etags-cho-html.md](../todo/A125-cloudflare-respect-strong-etags-cho-html.md).
