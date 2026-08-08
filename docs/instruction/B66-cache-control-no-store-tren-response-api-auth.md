# B66. `Cache-Control: no-store` trên response `/api/auth/*` (TODO.md #66)

**Nguồn:** `network_security_audit.md`, TODO.md #66.

## Cách tiếp cận

- Sửa tại `server/routes/auth.js`, không sửa Helmet global config — chỉ 3 route (`/login`,
  `/register`, `/guest`) cần header này, `GET /api/games*` có thể vẫn muốn cache bình thường (dữ
  liệu public, không nhạy cảm).
- Một dòng `res.set('Cache-Control', 'no-store')` (hoặc middleware nhỏ áp cho router `authRouter`)
  là đủ — không cần thư viện thêm.

## Điểm cần cẩn thận

- Đừng áp `no-store` lên toàn bộ `/api/*` mà không kiểm tra `games.js` trước — nếu `GET
  /api/games/stats` đang được cache hợp lý (giảm tải), việc chặn cache toàn cục có thể là regression
  hiệu năng không cần thiết.
- Test nên assert trực tiếp header trên response thật (supertest), không chỉ đọc code.

## Không có nội dung đặc biệt khác ngoài TODO.md #66.
