# B142 — Track `1fr` đẩy rail ra khỏi drawer

## Điểm cốt lõi

`1fr` == `minmax(auto, 1fr)`. Cái `auto` là **min-content của grid item**, và track không co xuống
dưới nó. Trong một grid **rộng cố định** có một track cỡ cố định bên cạnh (ở đây là rail 56px), điều
đó có nghĩa: nội dung dài trong cột kia sẽ **đẩy track cố định ra ngoài container**, chứ không phải
tự cắt. Đó là lý do phải là `minmax(0, 1fr)`.

`min-width: 0` **không** thay thế được: nó chỉ hạ ngưỡng co của flex item, không hạ min-content nội
tại mà grid dùng để size track. `.slot-card` và `.slot-card__name` đều đã có `min-width: 0` từ trước
mà lỗi vẫn xảy ra — đừng đi lại đường đó.

## Bẫy khi kiểm chứng

**Tài khoản khách KHÔNG tái hiện được lỗi.** Tên guest tự sinh (`FastMink`…) cho min-content 277px,
dưới ngưỡng track 283px. Phải đăng ký **tài khoản thật với tên dài** (giới hạn server: 2–24 ký tự,
`isValidDisplayName` trong `server/routes/auth.js`). Bốn vòng điều tra trước trượt đúng vì lý do này.

Cũng đừng đo bằng cách đọc `getComputedStyle(...).gridTemplateColumns` một mình — có trạng thái nó
trả về giá trị không khớp vị trí đặt thật của rail. Đo bằng `getBoundingClientRect()` của
`.sidebar-tabs` so với `.panel-right-shell` (tràn bao nhiêu, còn thấy bao nhiêu).

## Không đụng

- `overflow: hidden` / `justify-content: flex-end` / `width` cố định của `.panel-right-shell` và
  `.panel-right` — cơ chế cắt xén là **chủ ý** (§B138, tránh reflow chữ khi drawer co giãn).
- Nhánh `@media (max-width: 768px)` — đã có `grid-template-columns: 100%`, không dính lỗi. Đừng sửa
  lan sang đó.
- `white-space: nowrap` + ellipsis trên `.slot-card__name` — đó là cách hấp thụ tên dài đúng thiết kế.
