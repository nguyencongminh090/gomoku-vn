# Sequence — Migration: cửa sổ đọc-cả-hai (dual-read)

Liên quan: [../../user_story.md](../../user_story.md) · [../../planning.md](../../planning.md) ·
[sequence-login-and-socket-handshake.md](sequence-login-and-socket-handshake.md)

## Vấn đề

Lúc bản mới lên, ngoài kia đang có những `gvn_token` hợp lệ trong `localStorage` — tới **7 ngày**
với user thường, 24h với guest (`config.js:110-111`). Nếu server đổi phắt sang chỉ-đọc-cookie,
toàn bộ số đó bị `connect_error('AUTH_REQUIRED')` ngay lập tức và mọi người bị đá về trang đăng
nhập cùng lúc — guest thì mất luôn phiên vì không có tài khoản để đăng nhập lại.

## Giải pháp: `verifySocketToken` đọc cookie **trước**, rơi về `auth.token` sau

Chỉ một hàm phải đổi. Trong cửa sổ chuyển tiếp, client mới vẫn gửi kèm `auth: { token }` **nếu** nó
còn tìm thấy token cũ trong `localStorage`, và nâng cấp âm thầm sang cookie ở lần kết nối đầu tiên.

```mermaid
sequenceDiagram
    autonumber
    participant B as Trình duyệt (JS)
    participant LS as localStorage (token cũ)
    participant CJ as Cookie jar
    participant IO as verifySocketToken
    participant EX as POST /api/auth/upgrade-session

    Note over B,LS: Client mới, lần đầu chạy sau khi cập nhật
    B->>LS: getItem('gvn_token')
    alt Còn token cũ (chưa migrate)
        LS-->>B: token
        B->>EX: POST { token } (credentials:'same-origin')
        IO-->>EX: jwt.verify(token)
        alt hợp lệ
            EX->>CJ: Set-Cookie: gvn_token=<JWT cũ, giữ nguyên exp><br/>HttpOnly; SameSite=Lax
            EX-->>B: 200 { user: { userId, displayName, isGuest, exp } }
            B->>LS: removeItem('gvn_token'), removeItem('gvn_display_name')
            B->>B: lưu gvn_user (không bí mật)
            Note right of B: Đổi chỗ lưu, KHÔNG cấp token mới<br/>→ guest không mất phiên
        else hết hạn/hỏng
            EX-->>B: 401
            B->>LS: dọn sạch → login.html
        end
    else Đã migrate (không còn token cũ)
        LS-->>B: null
        Note right of B: Đi thẳng luồng cookie bình thường
    end

    B->>IO: io({ withCredentials: true })
    Note over IO: Thứ tự đọc trong cửa sổ chuyển tiếp
    IO->>CJ: 1. parse handshake.headers.cookie
    alt có cookie
        IO->>IO: jwt.verify(cookie) → socket.user
    else không có cookie
        IO->>IO: 2. fallback handshake.auth.token (client cũ đang mở tab)
        Note right of IO: Chỉ tồn tại trong cửa sổ chuyển tiếp;<br/>gỡ bỏ sau khi hết hạn dài nhất (7 ngày)
    end
```

## Mốc gỡ bỏ fallback

Nhánh `handshake.auth.token` là **nợ kỹ thuật có hạn sử dụng**, không phải thiết kế lâu dài — để
lại vĩnh viễn thì `HttpOnly` vô nghĩa (kẻ tấn công XSS chỉ cần tự gắn `auth.token` lấy từ đâu đó).
Đề xuất: giữ **≥ 7 ngày** kể từ ngày deploy (bằng đúng `JWT_EXPIRY` dài nhất), rồi xoá nhánh
fallback + endpoint `/api/auth/upgrade-session` trong một commit dọn dẹp riêng, có ghi mốc ngày cụ
thể vào `docs/todo/` để không bị quên.

> Phương án thay thế (đơn giản hơn nhiều): **không làm dual-read**, chấp nhận đá toàn bộ phiên đang
> mở về trang đăng nhập một lần duy nhất. Với quy mô hiện tại của app đây có thể là đánh đổi hợp lý
> — xem câu hỏi mở **Q5** trong [../../planning.md](../../planning.md), người dùng cần chốt.
