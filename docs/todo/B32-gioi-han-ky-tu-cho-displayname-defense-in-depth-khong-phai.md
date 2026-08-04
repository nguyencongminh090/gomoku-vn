# Phần B #32. Giới hạn ký tự cho `displayName` — defense-in-depth, không phải lỗ hổng

**Nguồn:** security review toàn bộ codebase (2026-08-03)


32. ~~**Giới hạn ký tự cho `displayName` — defense-in-depth, không phải lỗ hổng
    đang mở**~~
    **✅ ĐÃ XONG (2026-08-03)** — `isValidDisplayName` (`server/routes/auth.js`)
    nay ngoài kiểm độ dài (2-24 ký tự, giữ nguyên) còn từ chối `DISPLAY_NAME_
    FORBIDDEN`: 5 ký tự có ý nghĩa trong HTML/attribute/JS-string (`< > & " '`)
    + control character C0/C1 (`U+0000-U+001F`, `U+007F-U+009F` — bao gồm
    xuống dòng, tab, NUL, ký tự định dạng vô hình).
    - **Chọn deny-list, KHÔNG allow-list ASCII** — đúng ràng buộc quan trọng
      nhất của `instruction.md` §B32. Tên tiếng Việt có dấu ("Nguyễn Văn A"),
      chữ Latin-1 có dấu, chữ CJK... đều **qua được**; đây là phần dễ hỏng
      nhất nên test bên accept quan trọng ngang test bên reject.
    - **Chỉ đúng 1 call site**: `POST /api/auth/register`. **Đính chính mô tả
      gốc của mục này** — repo **không có route đổi tên hiển thị** nào (mô tả
      cũ viết "khi đăng ký/đổi tên hiển thị"); tên khách do server tự sinh từ
      `config.GUEST_NAME_ADJECTIVES/NOUNS` nên không đi qua hàm này.
    - **Cố ý KHÔNG mở rộng phạm vi** (rule scope discipline): không chặn thêm
      backtick/backslash dù cùng lý lẽ — không nằm trong danh sách §B32 đưa
      ra. Lớp escape phía client giữ nguyên, đây là lớp chặn **thêm** ở nguồn,
      không thay thế.
    - **Thu hẹp đã biết, chấp nhận:** cấm `'` cũng chặn luôn tên thật kiểu
      "O'Brien"/"D'Angelo" — không phải rủi ro với người dùng Việt (đối tượng
      của app), và `'` đúng là ký tự thoát ra khỏi ngữ cảnh
      `onclick="joinRoom('…')"` mà repo này đang dùng — nhưng đây là đánh đổi
      thật, không phải lợi ích miễn phí.
    - **Không đụng file `client/`** → không bump `?v=N`. Chỉ sửa thêm thông
      báo lỗi 400 để nói rõ vi phạm luật ký tự, không phải luật độ dài.
    - **Test:** file mới `server/tests/auth-display-name.test.js`, 25 case
      chạy qua route thật (hàm là module-private, và route mới là thứ thật sự
      gác cửa vào DB): 9 case accept (tiếng Việt có dấu, khoảng trắng giữa
      tên, Latin-1, CJK, biên 2 và 24 ký tự, trim, dấu câu không phải HTML),
      12 case reject (payload thẻ, `<`, `>`, `&`, `"`, `'`, img/onerror,
      newline, CR, tab, NUL, C1), + reject theo độ dài vẫn chạy, reject
      non-string, thông báo lỗi có nhắc luật ký tự, và tên bị từ chối **không
      bao giờ** tới `db.createUser` lẫn `bcrypt.hash`.
      **Mutation-check** (trên bản copy tạm, không sửa file gốc): khôi phục
      bản chỉ-kiểm-độ-dài → **đúng 11/25 đỏ** (toàn bộ phía reject), 9 case
      accept + case độ dài vẫn xanh — xác nhận test bắt đúng hành vi mới chứ
      không phải chỉ bắt "hàm có tồn tại". `npm test` 359/359 xanh.
      `express-rate-limit` bị stub thành pass-through **chỉ trong file test
      này** (ma trận ký tự cần ~30 request register từ 1 IP, vượt hạn mức
      20/15 phút của `authLimiter`) — ngưỡng production không đổi, đúng luật
      "đừng nới rate limiter trong code production chỉ để tự test được".
    - **Ngoài phạm vi, ghi lại chứ chưa làm:** ký tự Unicode gây giả mạo hiển
      thị (zero-width, RTL override `U+202E`, homoglyph) vẫn qua được — đó là
      mối đe doạ *spoofing tên*, khác với XSS mà §B32 nhắm tới. Nếu sau này
      thấy cần thì mở mục riêng, không gộp ngược vào đây.
