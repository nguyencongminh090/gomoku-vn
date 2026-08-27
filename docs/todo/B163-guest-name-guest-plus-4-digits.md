# B163 — Đổi tên hiển thị của khách thành `guest` + 4 chữ số ngẫu nhiên

**Nguồn:** yêu cầu người dùng (2026-08-28), chốt scope qua `AskUserQuestion`.

**Mô tả:** hiện `generateGuestName()` (`server/routes/auth.js:246`) ghép 1 tính
từ + 1 danh từ từ `config.GUEST_NAME_ADJECTIVES` / `GUEST_NAME_NOUNS` → ra tên
kiểu `WildFox`, `NeonBear`. Người dùng muốn đổi sang định dạng
`guest<random_number:4 digits>`, ví dụ `guest4821`.

**Kỳ vọng:**
- Tên hiển thị khách = chuỗi `guest` + đúng 4 chữ số.
- **Giữ kiểm tra trùng** (người dùng chọn phương án này): nếu tên vừa sinh trùng
  với `displayName` của một phiên khách đang hoạt động thì sinh lại; giới hạn số
  lần thử để không kẹt vòng lặp.

**Giải pháp đề xuất:**
- Viết lại `generateGuestName()` để trả `'guest' + <4 digits>`. Dùng
  `crypto.randomInt(0, 10000)` rồi `String(n).padStart(4, '0')` (0000–9999), hoặc
  1000–9999 nếu muốn luôn 4 chữ số không dẫn 0 — **chốt: cho phép dẫn 0
  (0000–9999)** trừ khi người dùng nói khác khi implement.
- Vòng lặp `do…while` kiểm tra trùng với các phiên khách đang online. Cần xác
  định nguồn tra cứu tên khách đang hoạt động (danh sách online users / session
  store) khi implement — nếu không có tra cứu rẻ, ghi rõ giới hạn thay vì bịa.
- Cân nhắc giữ / xoá `GUEST_NAME_ADJECTIVES` + `GUEST_NAME_NOUNS` trong
  `config.js` nếu không còn nơi dùng (grep trước khi xoá).

**Ranh giới:**
- `generateGuestName()` còn được gọi ở `server/routes/auth.js:567` làm *fallback*
  khi đăng nhập Google không có tên dùng được. Quyết định khi implement: dùng
  chung định dạng `guestNNNN` cho fallback đó, hay tách hàm riêng để tên fallback
  của tài khoản thật vẫn giống tên người. Mặc định: dùng chung, đơn giản hơn.
- Không đụng validate `isValidDisplayName` (khách không đi qua đường đó).

**Đánh giá hiệu quả/an toàn:** thay đổi server-only, 1 hàm thuần. Trùng tên khách
không phải lỗi bảo mật (guestId `guest_<uuid8>` mới là định danh, không đổi). Rủi
ro thấp.

**Bump `?v=N`:** KHÔNG — chỉ chạm `server/`.

**Unit test:** có hạ tầng Jest server-side → thêm test cho `generateGuestName()`:
khớp regex `^guest\d{4}$`; (nếu tách được) vòng lặp kiểm-trùng sinh lại khi va
chạm; boundary padStart cho số < 1000.

**Trạng thái:** ✅ ĐÃ XONG (2026-08-28, `feature/guest-name-numeric` → `dev`).
- `server/routes/auth.js` `generateGuestName()`: viết lại → `'guest' +
  String(crypto.randomInt(0, 10000)).padStart(4, '0')` (luôn 9 ký tự, giữ dẫn 0).
  Vòng lặp `GUEST_NAME_MAX_TRIES = 20` re-roll khi trùng, hết lượt trả candidate
  cuối. Vẫn dùng chung làm fallback tên cho OAuth không có tên dùng được (test
  OAuth cũ chỉ yêu cầu length ≥ 2 + không ký tự cấm — `guestNNNN` thoả).
- `server/managers/SessionManager.js`: thêm `isGuestDisplayNameInUse(name)` →
  gọi `db.hasLiveGuestSessionWithDisplayName(name, nowISO)`.
- `server/db/database.js`: thêm helper `hasLiveGuestSessionWithDisplayName` —
  `SELECT 1 ... WHERE display_name = ? AND is_guest = 1 AND revoked_at IS NULL
  AND expires_at > ?`. Chỉ tính guest còn sống; user thật trùng tên không chặn.
- `server/config.js`: xoá `GUEST_NAME_ADJECTIVES` / `GUEST_NAME_NOUNS` + 2 dòng
  export (không còn nơi dùng).
- Test: `server/tests/guest-name.test.js` (13 case) — format `^guest\d{4}$` ×25,
  boundary padStart (0/7/42/999/9999), re-roll qua tên bị chiếm rồi settle,
  give-up sau đúng 20 lần, và `isGuestDisplayNameInUse` chỉ va chạm với guest
  còn sống (bỏ qua expired / revoked / user thật) — chạy trên SQLite in-memory
  từ schema thật. 4 file test auth cũ được thêm mock `hasLiveGuestSessionWithDisplayName`.
  `npm test` 1413/1413.
- Không chạm `client/` ⇒ không bump `?v=N`.

`[Model: Sonnet 5]`
