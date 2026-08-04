# Phần B #4. `SELECT *` lộ player_id + thiếu rate limit `GET /api/games` (review 6.4)

**Nguồn:** `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)


4. ~~**`SELECT *` lộ player_id + thiếu rate limit `GET /api/games`** (review 6.4)~~
   **✅ ĐÃ XONG** (2026-08-02, commit `1b8c458`, merge `15fda80`) —
   `getGameById` chọn cột tường minh (bỏ `black_player_id`/`white_player_id`);
   thêm `gamesLimiter` (15 phút / 300 request) cho cả 2 route. Test: file mới
   `server/tests/games-route.test.js`, 6 case chạy SQL thật trên SQLite
   in-memory; `npm test` 180/180 xanh. Đã kiểm trên server thật (header
   `X-RateLimit-Limit: 300` ở cả 2 route). **2 điểm cần biết → mục 16 và 17
   bên dưới** (client *có* đọc 2 cột đó cho dữ liệu cũ; route list vẫn trả
   ids). Chi tiết: `docs/fix-log.md`.
