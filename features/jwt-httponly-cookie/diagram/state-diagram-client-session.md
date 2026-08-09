# State diagram — Trạng thái phiên phía client

Liên quan: [../user_story.md](../user_story.md) · [../planning.md](../planning.md) ·
[uml_diagram/sequence-login-and-socket-handshake.md](uml_diagram/sequence-login-and-socket-handshake.md)

## Hiện tại — một nguồn sự thật duy nhất: `localStorage.gvn_token`

JS vừa là nơi *giữ* bí mật, vừa là nơi *quyết định* đã đăng nhập hay chưa. Hai vai trò này bị gộp
làm một, và đó chính là thứ `HttpOnly` buộc phải tách ra.

```mermaid
stateDiagram-v2
    [*] --> ChuaDangNhap

    ChuaDangNhap: Chưa đăng nhập
    ChuaDangNhap: localStorage.gvn_token = null
    ChuaDangNhap: authGuard() → login.html

    DaDangNhap: Đã đăng nhập
    DaDangNhap: gvn_token + gvn_display_name trong localStorage
    DaDangNhap: getUserInfo() giải mã JWT phía client

    SocketMo: Socket đang mở
    SocketMo: socket.user do server gán từ auth.token

    ChuaDangNhap --> DaDangNhap: login / register / guest<br/>→ setItem('gvn_token')
    DaDangNhap --> SocketMo: io({ auth: { token } })<br/>verifySocketToken OK
    SocketMo --> DaDangNhap: disconnect (mạng)<br/>tự reconnect với cùng token
    SocketMo --> ChuaDangNhap: connect_error AUTH_INVALID<br/>→ removeItem('gvn_token')
    DaDangNhap --> ChuaDangNhap: logout() → removeItem (thuần client, không thể fail)

    KickedTab: Tab bị đá (session:kicked)
    KickedTab: sessionStorage.gvn_kicked_notice = '1'
    SocketMo --> KickedTab: server đá phiên (đăng nhập nơi khác)
    KickedTab --> ChuaDangNhap: → login.html
    note right of KickedTab
        CỐ Ý không xoá gvn_token:
        localStorage dùng chung mọi tab,
        xoá sẽ đá lây tab anh em.
        Xem socket-client.js:101-114
    end note
```

## Đề xuất — tách bí mật (cookie) khỏi cờ phiên (profile)

Cookie giữ bí mật; `gvn_user` chỉ là **cache hiển thị không bí mật**, và server là nguồn sự thật
cuối cùng qua `session:me` / lỗi handshake.

```mermaid
stateDiagram-v2
    [*] --> ChuaDangNhap

    ChuaDangNhap: Chưa đăng nhập
    ChuaDangNhap: không cookie, không gvn_user
    ChuaDangNhap: authGuard() đọc gvn_user → login.html

    TinCoPhien: Tin rằng có phiên (chưa xác nhận)
    TinCoPhien: gvn_user tồn tại, exp chưa qua
    TinCoPhien: cookie CHƯA được kiểm chứng — JS không đọc được

    SocketMo: Socket đang mở (phiên đã xác nhận)
    SocketMo: server xác thực cookie → socket.user
    SocketMo: session:me làm mới gvn_user

    ChuaDangNhap --> TinCoPhien: login/register/guest<br/>Set-Cookie + lưu gvn_user
    TinCoPhien --> SocketMo: io({ withCredentials:true })<br/>cookie tự đính kèm, verify OK
    TinCoPhien --> ChuaDangNhap: connect_error AUTH_REQUIRED/AUTH_INVALID<br/>(cookie thiếu/hết hạn) → xoá gvn_user
    SocketMo --> TinCoPhien: disconnect (mạng)<br/>reconnect: cookie tự gửi lại
    SocketMo --> DangDangXuat: bấm Đăng xuất

    DangDangXuat: Đang đăng xuất
    DangDangXuat: chờ POST /api/auth/logout
    DangDangXuat --> ChuaDangNhap: 204 → cookie bị xoá, dọn gvn_user
    DangDangXuat --> SocketMo: lỗi mạng → VẪN đang đăng nhập,<br/>báo lỗi, KHÔNG chuyển trang

    KickedTab: Tab bị đá (session:kicked)
    SocketMo --> KickedTab: server đá phiên
    KickedTab --> ChuaDangNhap: → login.html
    note right of KickedTab
        Cookie cũng dùng chung mọi tab,
        nên vẫn KHÔNG xoá cookie ở đây —
        ràng buộc cũ được bảo toàn nguyên vẹn.
    end note
```

## Trạng thái mới cần chú ý

Hai trạng thái dưới đây **không tồn tại** trong mô hình hiện tại và là nguồn lỗi tiềm tàng — cần
test riêng:

1. **`TinCoPhien` — "tin rằng có phiên" nhưng cookie đã mất.** Hôm nay token và cờ đăng nhập là
   *cùng một thứ*, nên không bao giờ lệch nhau. Sau khi tách, `gvn_user` có thể còn trong khi cookie
   đã hết hạn/bị xoá thủ công → user thấy giao diện lobby chớp lên rồi mới bị đá về login. Chấp nhận
   được, nhưng phải cố ý xử lý (ví dụ chỉ render sau `connect`, hoặc dựng skeleton), không để nó
   thành lỗi "nháy màn hình" bị báo lại sau.
2. **`DangDangXuat` — đăng xuất có thể thất bại.** Chuyển ngay về `login.html` mà không chờ 204 sẽ
   để lại cookie sống trên máy → user tưởng đã đăng xuất nhưng chưa. Đây là hồi quy bảo mật *do
   chính bản sửa bảo mật tạo ra* nếu làm ẩu.
