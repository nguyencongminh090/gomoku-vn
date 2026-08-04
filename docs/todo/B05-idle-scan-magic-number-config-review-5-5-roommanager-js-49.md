# Phần B #5. Idle-scan magic number → config (review 5.5) — `RoomManager.js:49-52`,

**Nguồn:** `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)


5. ~~**Idle-scan magic number → config** (review 5.5) — `RoomManager.js:49-52`,
   rút `60000` thành hằng số trong `config.js`.~~
   **✅ ĐÃ XONG** (2026-08-02, commit `c468d16`, merge `2a622db`) — thêm
   `IDLE_SCAN_INTERVAL_MS = 60_000` vào `config.js` ngay dưới `IDLE_TIMEOUT_MS`;
   hành vi không đổi. TODO nói "không cần test riêng" nhưng vẫn viết theo rule
   `CLAUDE.md`: file mới `server/tests/RoomManager.test.js` (4 case, mock config
   bằng **sentinel** `12_345` — nếu assert theo giá trị thật 60_000 thì test vẫn
   xanh dù chưa sửa gì). Đã mutation-check: khôi phục literal thì 2/4 case đỏ.
   `npm test` 184/184 xanh. **File này là thứ mục 7 (room quota theo IP) cần —
   mục đó mở rộng file sẵn có, không phải tạo mới.** Chi tiết: `docs/fix-log.md`.
