# Phần B #3. `escapeAttr` sửa đúng cách escape (review 3.7) — `lobby.js:474-476`,

**Nguồn:** `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)


3. ~~**`escapeAttr` sửa đúng cách escape** (review 3.7) — `lobby.js:474-476`,
   `room-ui.js:62-64`, đổi `\"`/`\'` → `&quot;`/`&#39;`.~~
   **✅ ĐÃ XONG** (2026-08-01, commit `d5c68ba`, merge `340812f`) — tách thành
   module thuần mới `client/js/escape-utils.js` (UMD, require được từ Node như
   `profanity-filter.js`), export `escapeAttr` (entity) + `escapeJsString`
   (backslash). **Lệch có chủ ý so với `instruction.md` §B3:** 2/4 call site là
   `onclick="joinRoom('…')"` — chuỗi JS lồng trong attribute HTML; chỉ escape
   entity ở đó sẽ **tạo lỗ mới** (parser giải mã `&#39;` thành `'` thật trước
   khi JS được parse), nên 2 site đó dùng `escapeAttr(escapeJsString(x))`.
   Đã bump `?v=26` → `?v=27` (45 chỗ). Test: file mới
   `server/tests/escape-utils.test.js`, 13 case; `npm test` 172/172 xanh.
   **Đã kiểm bằng browser thật** (Playwright, 2026-08-02): card sảnh khớp
   `.room-card[data-room-id="#MJ7"]`, `onclick` render đúng `joinRoom('#MJ7')`
   và bấm vào thì vào phòng thật; nút kick render đúng
   `kickUser('guest_40ab74a5')`. Chi tiết: `docs/fix-log.md`.

   *Đính chính:* jest `testMatch` thực tế là `**/tests/**/*.test.js` (không chỉ
   `server/tests/**`), nên test cho code client **không** cần đổi config.
