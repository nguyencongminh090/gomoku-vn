# B163 — Tên khách `guest` + 4 chữ số

**Việc:** viết lại `generateGuestName()` (`server/routes/auth.js:246`) trả về
`'guest' + <4 chữ số>`, giữ kiểm tra trùng (người dùng đã chốt).

**Cách làm:**
1. Dùng `crypto` đã import sẵn: `crypto.randomInt(0, 10000)` →
   `String(n).padStart(4, '0')`. Định dạng cho phép dẫn 0 (`guest0007`), khoảng
   0000–9999.
2. Vòng `do { candidate = 'guest' + nnnn } while (đang trùng && thử < LIMIT)`.
   Trước tiên xác định cách liệt kê `displayName` của khách đang hoạt động
   (kiểm `getOnlineUsersList()` / session store — B159 vừa đổi shape danh sách
   online thành `[{userId, displayName, isGuest}]`, có thể tận dụng). Nếu không
   có tra cứu đồng bộ rẻ trong ngữ cảnh route, **ghi rõ trong summary** rằng chỉ
   chống trùng ở mức best-effort / bỏ qua, đừng dựng thêm hạ tầng.
3. `LIMIT` nhỏ (vd 20); hết lượt vẫn trả candidate cuối (10⁴ không gian, va chạm
   thực tế ~0).

**Pitfalls:**
- `generateGuestName()` cũng là fallback OAuth ở dòng ~567. Mặc định dùng chung
  định dạng mới; nếu người dùng muốn tên fallback OAuth vẫn "giống người" thì tách
  `generateGuestName()` / `generateOAuthFallbackName()` — hỏi trước khi tách.
- Grep `GUEST_NAME_ADJECTIVES` / `GUEST_NAME_NOUNS` toàn repo; nếu không còn nơi
  dùng thì xoá cả 2 mảng + 2 dòng export trong `config.js` (dòng ~162–167,
  253–254). Nếu còn nơi dùng thì để nguyên.
- KHÔNG bump `?v=N` (không chạm client).
- KHÔNG đụng `isValidDisplayName` / đường register.

**Test:** `server/tests/**` Jest. Assert regex `^guest\d{4}$` trên nhiều lần gọi;
padStart cho nhánh số < 1000; nếu vòng kiểm-trùng test được thì stub danh sách
online để ép 1 lần va chạm rồi kiểm sinh lại.

[chi tiết todo](../todo/B163-guest-name-guest-plus-4-digits.md)
