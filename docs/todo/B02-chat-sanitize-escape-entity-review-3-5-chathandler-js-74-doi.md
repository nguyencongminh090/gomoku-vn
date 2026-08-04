# Phần B #2. Chat sanitize → escape entity (review 3.5) — `ChatHandler.js:74`, đổi

**Nguồn:** `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)


2. ~~**Chat sanitize → escape entity** (review 3.5) — `ChatHandler.js:74`, đổi
   `replace(/<[^>]*>/g,'')` → escape `&lt;`/`&gt;`.~~
   **✅ ĐÃ XONG** (2026-08-01, commit `8fb3c4e`, merge `248ff36`) — `sanitize()`
   nay escape `<`/`>`; **cố ý không escape `&`** (client render bằng
   `textContent`, escape `&` sẽ làm hỏng chữ thường như "R&D", mà cũng không
   thêm an toàn gì). Test: file mới `ChatHandler.test.js`, 11 case gồm đúng
   chuỗi repro của review; `npm test` 159/159 xanh. Chi tiết: `docs/fix-log.md`.
