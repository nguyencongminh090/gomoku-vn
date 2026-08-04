# Phần A #2. Xác nhận biến môi trường khi deploy thật

**Nguồn:** `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)


#### 2. Xác nhận biến môi trường khi deploy thật

> **Cập nhật 2026-08-02 (commit `9bfa1be`):** phần **chạy local** đã xử lý xong —
> `server/config.js` tự đọc `.env` (qua `server/utils/load-env.js`), và
> `./start.sh` tự sinh secret ngẫu nhiên vào `.env` ở lần chạy đầu. Biến môi
> trường thật **luôn thắng** file, loader **không chạy** khi `NODE_ENV=test`.
> Phần còn lại của mục này vẫn là **việc của bạn**: xác nhận `JWT_SECRET` trên
> máy chủ thật được cấp qua biến môi trường của pm2/systemd/docker, **không**
> dựa vào file `.env` nằm cạnh code.

- `NODE_ENV` có được set khi chạy qua pm2/systemd/docker không? (fix #1 đã đổi
  guard `JWT_SECRET` thành throw ở mọi env trừ `test`, nên rủi ro cụ thể này đã
  giảm — nhưng vẫn cần xác nhận `JWT_SECRET` thật được cấp qua biến môi trường,
  không dùng giá trị mặc định trong code).
