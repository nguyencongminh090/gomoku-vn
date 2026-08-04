# Phần B #6. Timing attack — dummy bcrypt compare (review 3.6) — `auth.js:135-143`,

**Nguồn:** `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)


6. ~~**Timing attack — dummy bcrypt compare** (review 3.6) — `auth.js:135-143`,
   khi `!user` vẫn chạy `bcrypt.compare(password, DUMMY_HASH_CỐ_ĐỊNH)`.~~
   **✅ ĐÃ XONG** (2026-08-02, commit `985c9c4`, merge `2a842a1`) — thêm hằng
   `DUMMY_PASSWORD_HASH` (hardcode, cost 12 khớp `BCRYPT_ROUNDS`), bỏ
   early-return, đổi thành `if (!user || !match)`. Test: file mới
   `server/tests/auth-login-timing.test.js`, 9 case (đối xứng code path +
   2 guard ở mức source: hằng phải hardcode, cost phải khớp `BCRYPT_ROUNDS`);
   mutation-check: khôi phục early-return thì 3/9 đỏ. `npm test` 193/193 xanh.
   **Đã đo thời gian thật — xem Phần A #4, mục đó coi như đóng.**
   Chi tiết: `docs/fix-log.md`.
