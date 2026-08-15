# B126 — `modulepreload` cho ES module (STRICT — đo qua domain thật)

Hướng dẫn thực thi cho TODO.md #126 (chưa làm — **làm sau cùng**, sau #122/#123/#124/#125).

## Trước khi bắt đầu

- Đọc lại `docs/todo/B126-...md` — mục "Yêu cầu bắt buộc" là **bắt buộc**, không phải gợi ý, vì
  người dùng dùng Cloudflare Tunnel forward localhost thật ra domain thật (không có môi trường
  staging tách biệt).
- Kiểm tra `git status` sạch, đứng trên branch riêng theo `git-workflow` skill trước khi sửa file
  nào.

## Cách tiếp cận khi làm

- Với mỗi trang (`room.html`, `index.html`, và các trang khác dùng ES module qua entry point kiểu
  `room-entry.js`), liệt kê **toàn bộ** `import`/`import()` thật trong entry file — không suy đoán
  từ tên file, đọc trực tiếp source.
- Thêm `<link rel="modulepreload" href="...">` cho từng module đó vào `<head>`, path/`?v=N` khớp
  chính xác với import thật.
- Viết test canh drift (tham chiếu `client_preload_hints.test.js` của vcaro nêu trong review): parse
  danh sách `<link rel="modulepreload">` trong HTML + danh sách `import` trong entry file, assert 2
  tập khớp nhau. Đặt trong `client/tests/` hoặc vị trí phù hợp với test infra client hiện có.
- Bump `?v=N` theo quy tắc cache-busting.

## Đo lường — bắt buộc theo đúng phương pháp review vòng 4 đã dùng

- **Không đo trên localhost/HTTP/1.1** — sai kết luận đã biết trước (xem cảnh báo vcaro trong file
  todo).
- Đo qua domain thật, **lặp lại tối thiểu 7 lần**, lấy min/median — 1 lần chạy đơn lẻ là nhiễu (đã
  có tiền lệ sai gấp ~200 lần trong chính review vòng 4, mục 13.9).
- So sánh **trước/sau** bằng cùng phương pháp, ghi lại cả 2 bộ số liệu.
- Đo vào lúc traffic thấp nếu biết được, tránh đo trong lúc người chơi thật đang ở trong phòng.

## Xác minh không hỏng

- DevTools Network: xác nhận mỗi module chỉ tải **đúng 1 lần**, không phải 2 lần (bẫy chính của
  hint sai/thiếu — không báo lỗi console, chỉ lộ ra qua Network tab).
- Toàn bộ trang vẫn hoạt động đúng chức năng sau khi thêm hint — không chỉ nhìn Network mà phải
  thao tác thật (join room, chat, gửi nước đi) qua trình duyệt thật.

## Phạm vi KHÔNG làm

- Không đụng nội dung các module — chỉ thêm hint, không đổi cấu trúc import.
- Không gộp chung với #127 (gộp CSS) dù cùng nhóm STRICT — 2 việc độc lập, sửa riêng để dễ revert
  riêng nếu 1 trong 2 có vấn đề.

Xem thêm: [docs/todo/B126-modulepreload-cho-es-module-do-tren-domain-that-qua-tunnel.md](../todo/B126-modulepreload-cho-es-module-do-tren-domain-that-qua-tunnel.md).
