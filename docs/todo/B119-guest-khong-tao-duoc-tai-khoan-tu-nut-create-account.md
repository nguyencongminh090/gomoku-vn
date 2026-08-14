# #119 — Guest bấm "Create account" trong Settings không vào được form đăng ký

**Trạng thái:** chưa làm

## Nguồn

Báo cáo người dùng kèm ảnh chụp modal Settings (guest "FreeCrow") — "guest user report they cannot
create account by click Create Account in Settings. He must log out and create account outside."
(2026-08-14).

## Mô tả

Trong panel Settings toàn cục (`client/js/settings-panel.js`), khi tài khoản hiện tại là guest, nút
**"Create account"** render ra là `<a href="login.html">` (dòng 274-278). Bấm vào nút này điều hướng
sang `login.html`, nhưng người dùng bị bật ngược lại `index.html` ngay lập tức — không bao giờ thấy
được form đăng ký. Chỉ khi **Log out** trước (xoá session) thì vào `login.html` mới ở lại được.

## Nguyên nhân gốc (đã xác nhận qua đọc code, chưa sửa)

`client/js/login.js:22-48`, IIFE `checkExistingSession()`:

```js
const hasOAuthError = new URLSearchParams(window.location.search).has('error');
if (window.GvnSession.hasBelievedSession() && !sessionStorage.getItem('gvn_kicked_notice') && !hasOAuthError) {
  window.location.replace('index.html');
}
```

`hasBelievedSession()` (`client/js/session.js:112-114`) chỉ trả về `!!(getUser() || legacyToken())`
— **không phân biệt session guest với session thật**. Một guest luôn có `getUser()` khác null (đó
là cách toàn bộ app biết họ đang "đăng nhập" như guest), nên điều kiện này luôn đúng với guest →
`login.html` tự bounce về `index.html` trước khi form đăng ký kịp render, bất kể người dùng bấm vào
từ đâu.

Đây chính xác là lớp gây ra triệu chứng ("bấm Create Account không có tác dụng") — nút
`<a href="login.html">` trong `settings-panel.js` hoàn toàn đúng, không phải nơi cần sửa; layer thật
sự cần sửa là guard này trong `login.js` (đúng tinh thần "Root-cause diagnosis" trong `CLAUDE.md` —
không vá ở lớp triệu chứng).

## Vì sao chưa sửa ngay

Người dùng chọn "File to TODO/instruction" khi được hỏi (2026-08-14) thay vì fix ngay.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Mức độ:** trung bình — guest hoàn toàn không tự tạo được tài khoản qua đường tắt trong Settings,
  phải tự nhớ ra bước log out trước. Không mất dữ liệu, không phải lỗi bảo mật, nhưng là một UX dead
  end thực sự (đã có báo cáo người dùng cụ thể).
- **Hướng sửa dự kiến khi làm:** phân biệt guest session với session thật ngay tại
  `checkExistingSession()` — chỉ auto-bounce khi `hasBelievedSession()` đúng **và** người dùng không
  phải guest (cần đọc thêm field `isGuest` từ `GvnSession.getUser()`, tương tự cách
  `settings-panel.js:256,264,273` đã dùng `userInfo.isGuest`). Cân nhắc: guest bấm "Create account"
  cần vào được `login.html` và thấy tab đăng ký, KHÔNG được tự động đăng xuất guest session hiện tại
  (mất phòng đang chơi nếu có) — hành vi log out chỉ nên xảy ra khi họ thật sự submit form đăng ký
  thành công (`onAuthSuccess` đã ghi đè session cũ bằng session mới).
- Chi tiết cách làm: [docs/instruction/B119-guest-khong-tao-duoc-tai-khoan-tu-nut-create-account.md](../instruction/B119-guest-khong-tao-duoc-tai-khoan-tu-nut-create-account.md).

## Trạng thái test

Chưa viết — chưa sửa. Khi sửa: không có Jest cho `client/js/` (theo rule "Bug-fix workflow" trong
`CLAUDE.md`), verify bằng browser thật (`run` skill hoặc `playwright-e2e-safety`) — vào phòng làm
guest, mở Settings, bấm Create account, xác nhận form đăng ký hiển thị và ở lại `login.html`.
