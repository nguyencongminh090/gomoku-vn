# Báo cáo: Có nên chuyển JWT từ localStorage sang HttpOnly cookie?

**Bối cảnh:** Repo game cờ caro online (gomoku-vn), có tài khoản đăng ký + chế độ chơi Guest. Auth
dùng JWT. Một audit bảo mật (Antigravity IDE, 2026-08-08) nêu việc lưu JWT ở `localStorage` là rủi ro
XSS. Tài liệu này tóm tắt hiện trạng, mức độ rủi ro thực tế, và các phương án — để xin ý kiến trước
khi quyết định có làm hay không.

## 1. Hiện trạng kiến trúc (đã xác minh trên code)

- JWT được lưu ở `localStorage` (key `gvn_token`), dùng cho một việc duy nhất: bắt tay Socket.IO khi
  vào phòng chơi.
- **Guest và user đã đăng ký dùng chung một key `gvn_token`** — không có phân biệt nào giữa hai loại
  token về nơi lưu hay cách đọc.
- Client tự giải mã payload JWT bằng JavaScript (`atob()` + `JSON.parse`) ở 8 chỗ khác nhau để lấy
  tên hiển thị, dùng để kiểm tra "đã đăng nhập chưa", và để hiển thị danh tính trong phòng/giải đấu.
- Không có route REST nào yêu cầu xác thực hiện tại — mọi thao tác cần danh tính đi qua Socket.IO,
  không qua HTTP header `Authorization`.
- Hạn token: 7 ngày (user thường), 24 giờ (guest).

## 2. Rủi ro cụ thể là gì?

**Kịch bản duy nhất bị ảnh hưởng: một lỗ hổng XSS (Cross-Site Scripting) trong tương lai.**

Nếu kẻ tấn công tìm được cách chạy JavaScript tuỳ ý trong trang (ví dụ qua một chỗ hiển thị dữ liệu
người dùng chưa được escape đúng cách), đoạn JS đó có thể đọc `localStorage.getItem('gvn_token')` và
gửi token ra ngoài. Với token đánh cắp được, kẻ tấn công có thể **đăng nhập từ máy khác, mạo danh nạn
nhân trong 7 ngày** — với cả tài khoản đã đăng ký lẫn phiên guest, không phân biệt (do dùng chung key
như nói ở mục 1).

**Điều quan trọng: XSS này KHÔNG chặn được bằng cách đổi cookie.** Nếu đã có XSS chạy trong trang,
kẻ tấn công vẫn có thể hành động thay mặt nạn nhân ngay lập tức trong chính phiên đó (mở socket, đi
nước cờ, gửi chat) — vì cookie tự động gửi kèm mọi request. HttpOnly cookie chỉ chặn được việc **lấy
token mang ra dùng ở nơi khác/sau này**, không chặn lạm dụng ngay tại chỗ.

## 3. Rủi ro thực tế HIỆN TẠI cao hay thấp?

**Thấp** — vì điều kiện tiên quyết (có lỗ hổng XSS thực thi được) hiện **không tồn tại đã biết**:

- Lỗ hổng XSS duy nhất từng phát hiện trong repo (tin nhắn chat hiển thị HTML thô thay vì bị escape)
  đã được vá và xác minh bằng trình duyệt thật: gõ `<img src=x onerror=alert(1)>` vào ô chat, kết quả
  hiển thị là text vô hại, không có phần tử `<img>` sống nào được tạo ra trong DOM.
- Sau đó đã bổ sung Content-Security-Policy (`script-src 'self'`), chặn việc chèn/tải script từ nguồn
  bên ngoài — kể cả nếu ai đó tìm được cách chèn `<script src="...">`, trình duyệt sẽ tự chặn.

→ Không có đường khai thác XSS nào đang mở hiện tại. Rủi ro của việc này là phòng thủ cho **một lỗ
hổng XSS giả định trong tương lai**, không phải một lỗ hổng đang bị khai thác.

## 4. Các phương án

| # | Phương án | Chi phí | Hiệu quả |
|---|---|---|---|
| 1 | Giữ nguyên hiện trạng | 0 | Dựa vào CSP + escape kỷ luật đã có |
| 2 | Rút ngắn hạn token (7 ngày → vài giờ + làm mới) | Thấp — không đụng 8 điểm giải mã JWT phía client | Giảm cửa sổ token bị đánh cắp còn dùng được, không triệt tiêu |
| 3 | Chuyển JWT sang HttpOnly cookie | Cao — chạm 10+ file cả server lẫn client, phải viết lại cách client biết "mình là ai" (không giải mã JWT được nữa) | Chặn được rò rỉ/tái sử dụng token ngoài phiên; **không** chặn lạm dụng ngay trong phiên nếu có XSS |
| 4 | Chuyển sang OAuth (Google/Facebook login...) | Cao, hướng khác hẳn | **Không giải quyết vấn đề này** — xem mục 5 |

## 5. OAuth có phải là giải pháp không?

**Không.** OAuth chỉ đổi *cách xác thực ban đầu* (không cần app tự quản mật khẩu) — nó không quyết
định *nơi lưu phiên sau khi xác thực*. Một app dùng OAuth vẫn có thể lưu token phiên vào
`localStorage` y hệt bây giờ, và vẫn bị đánh cắp qua XSS y hệt bây giờ. OAuth và "cookie HttpOnly" là
hai trục độc lập — đổi OAuth mà không đổi nơi lưu token thì rủi ro này không giảm chút nào.

## 6. Câu hỏi cần góp ý

1. Có đáng làm phương án 3 (chi phí cao, chạm kiến trúc client) hay phương án 2 (rẻ hơn nhiều, giảm
   thiệt hại thay vì triệt tiêu) đủ dùng cho quy mô app hiện tại?
2. Nếu làm phương án 3: cách thay thế việc client "biết mình là ai" khi không còn đọc được JWT —
   qua một sự kiện server gửi xuống lúc kết nối, hay một API endpoint riêng để hỏi?
3. Có kịch bản/threat model nào khác đáng lo hơn XSS mà báo cáo này chưa tính đến không?
