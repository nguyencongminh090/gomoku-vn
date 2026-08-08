# JWT → HttpOnly cookie — User Story

Tài liệu thảo luận cho `TODO.md` #68 / `instruction.md` B68 — *"Cân nhắc chuyển JWT từ
`localStorage` sang `HttpOnly` cookie"*. Đây là **giai đoạn thảo luận thiết kế**, chưa phải công
việc đã được duyệt để code (theo quy tắc `features/<slug>/` trong `CLAUDE.md`). Bước bàn giao sang
`docs/todo/`/`docs/instruction/` nằm ở cuối [planning.md](planning.md).

## Nguồn gốc

`network_security_audit.md` (Antigravity IDE, 2026-08-08) nêu việc lưu JWT ở `localStorage`. B65
(CSP `script-src 'self'`, bỏ unpkg) đã cố tình **để mục này ra ngoài phạm vi** với lý do: *"Cookie
`HttpOnly` là một quyết định auth/CSRF lớn, cần threat model và migration riêng."* Tài liệu này là
threat model + migration đó.

## Ràng buộc kiến trúc cứng (đã xác minh trên code, 2026-08-08)

Những điều dưới đây không phải giả định — đã kiểm tra trực tiếp trên nhánh `dev`:

1. **JWT hiện chỉ được dùng cho một thứ duy nhất: bắt tay (handshake) Socket.IO.**
   `verifySocketToken` được gắn ở [server/index.js:100](../../server/index.js#L100) (`io.use(...)`).
   Middleware Express `verifyToken` ([server/middleware/auth.js:26](../../server/middleware/auth.js#L26))
   được export nhưng **không được mount ở bất kỳ route nào** — grep toàn bộ `server/` chỉ ra khai
   báo và export, không có nơi sử dụng. `/api/games/*` là read-only, không xác thực; `/api/auth/*`
   là nơi phát token. Không có một dòng `Authorization: Bearer` nào trong toàn bộ `client/js/`.
   → **Hệ quả:** bề mặt CSRF hôm nay gần như bằng không (không có REST endpoint nào đổi trạng thái
   và đọc danh tính từ cookie), nhưng đặt cookie vào là tạo sẵn một cái bẫy CSRF cho *bất kỳ* route
   REST có xác thực nào thêm vào sau này.

2. **Client giải mã payload JWT bằng JS để lấy danh tính người dùng.** `getUserInfo()` tồn tại hai
   bản gần như giống hệt nhau —
   [socket-client.js:147](../../client/js/socket-client.js#L147) và
   [settings-panel.js:27](../../client/js/settings-panel.js#L27) — cùng làm `atob(token.split('.')[1])`
   rồi `JSON.parse`. Nơi gọi: `lobby.js:70`, `room.js:51`, `tournaments.js:59`,
   `tournament-match.js:86`, `tournament-detail.js:61`, `settings-panel.js:208`.
   → **Hệ quả:** `HttpOnly` xoá bỏ hoàn toàn khả năng này. Đây là điểm chặn lớn nhất, lớn hơn cả
   phần socket handshake.

3. **Chốt chặn đăng nhập (auth guard) dựa trên sự *tồn tại* của token trong `localStorage`.**
   `lobby.js:28`, `room.js:42`, `socket-client.js:33` đều làm
   `if (!localStorage.getItem('gvn_token')) → login.html`.
   → **Hệ quả:** cần một tín hiệu "đang đăng nhập" mà JS **được phép** đọc, tách khỏi token bí mật.

4. **`localStorage` được chia sẻ giữa các tab và điều này là *cố ý*.**
   [socket-client.js:101-114](../../client/js/socket-client.js#L101-L114) có comment dài giải thích
   tab bị `session:kicked` **không được** xoá `gvn_token`, vì làm vậy sẽ đá luôn các tab anh em.
   Cookie cũng chia sẻ theo origin y hệt → ràng buộc này được bảo toàn, không phải rủi ro mới.

5. **Sản phẩm chạy sau Cloudflare Tunnel (HTTPS), dev chạy `http://localhost:3000`.**
   → Cờ `Secure` phải phụ thuộc môi trường, nếu không cookie sẽ bị trình duyệt bỏ im lặng ở dev —
   đúng loại bẫy "dev khác prod" mà mục "Root-cause diagnosis" trong `CLAUDE.md` cảnh báo.

6. **Hạn token: 7 ngày (user thường), 24h (guest)** — `config.js:110-111`. Guest cũng nhận JWT y
   như user thường (`POST /api/auth/guest`), nên mọi thay đổi phải bao cả guest.

## Actors

- **User thường** — đăng ký/đăng nhập, token 7 ngày, mong muốn không phải đăng nhập lại mỗi lần mở
  trình duyệt.
- **Guest** — bấm "chơi ngay", token 24h, không có tài khoản, không có gì để "đăng nhập lại".
- **Kẻ tấn công XSS (giả định)** — chạy được JS cùng origin. B65 đã chặn script bên thứ ba; kịch
  bản còn lại là một lỗ hổng XSS tự thân trong tương lai.

## User stories

- Là **user thường**, tôi muốn token phiên của mình **không đọc được bằng JavaScript**, để một lỗi
  XSS tương lai không thể lấy trộm một chứng chỉ dùng được 7 ngày rồi đăng nhập vào tài khoản tôi
  từ máy khác.
- Là **user thường**, tôi vẫn muốn thấy tên hiển thị của mình trên thanh điều hướng và vẫn được
  nhận diện đúng trong phòng chơi/giải đấu — tức là mất khả năng giải mã JWT phía client **không
  được** làm hỏng giao diện.
- Là **guest**, tôi vẫn muốn vào chơi bằng một cú bấm, không thêm bước nào.
- Là **user đang có phiên hợp lệ trong `localStorage` lúc bản mới lên**, tôi không muốn bị đá ra
  đăng nhập lại một cách vô cớ.
- Là **người bảo trì repo**, tôi muốn thay đổi này không âm thầm tạo ra lỗ hổng CSRF cho tính năng
  REST sau này — nếu đã có cookie tự động gửi kèm, phải có quy tắc rõ ràng đi kèm.

## Threat model — hiểu đúng mức lợi ích

Cần nói thẳng, vì nó quyết định độ ưu tiên:

| Kịch bản | `localStorage` hôm nay | `HttpOnly` cookie |
|---|---|---|
| XSS **lấy trộm** token, dùng lại từ máy khác trong 7 ngày | ✗ Bị | ✓ Chặn được |
| XSS **hành động thay mặt nạn nhân ngay trong trang** (mở socket, đi nước cờ, chat) | ✗ Bị | ✗ **Vẫn bị** — cookie tự động gửi kèm |
| Rò token qua log/extension/devtools của người dùng | ✗ Bị | ✓ Chặn được |
| CSRF từ trang khác | ✓ Không áp dụng (không có cookie) | ⚠ **Bề mặt mới**, phải xử lý bằng `SameSite` |

→ Lợi ích là **thật nhưng có giới hạn**: chặn *rò rỉ/tái sử dụng ngoài phiên*, không chặn *lạm dụng
trong phiên*. Đây là phòng thủ theo chiều sâu, đúng như B68 ghi — không phải vá một lỗ hổng đang
khai thác được.

## Ngoài phạm vi

- **Không** đụng tới thuật toán ký JWT, `JWT_SECRET`, hay thời hạn token — chỉ đổi *nơi lưu* và
  *cách truyền*.
- **Không** thêm refresh token / rotation / danh sách thu hồi (revocation). Đó là thay đổi auth độc
  lập, nếu muốn thì mở `features/` riêng.
- **Không** thêm xác thực cho `/api/games/*` — nó đang là read-only công khai một cách có chủ đích.

## Liên kết

- [planning.md](planning.md) — câu hỏi mở và trình tự triển khai.
- [diagram/uml_diagram/sequence-login-and-socket-handshake.md](diagram/uml_diagram/sequence-login-and-socket-handshake.md)
  — luồng hiện tại vs. luồng đề xuất.
- [diagram/uml_diagram/sequence-migration-dual-read.md](diagram/uml_diagram/sequence-migration-dual-read.md)
  — cửa sổ chuyển tiếp cho token cũ.
- [diagram/state-diagram-client-session.md](diagram/state-diagram-client-session.md)
  — trạng thái phiên phía client, trước và sau.
