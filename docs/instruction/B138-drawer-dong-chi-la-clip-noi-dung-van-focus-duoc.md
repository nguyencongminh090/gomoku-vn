# B138 — Drawer đóng: nội dung bị cắt nhưng vẫn focus được

## Điểm cốt lõi

`inert` là **thuộc tính DOM**, không set được bằng CSS. Nghĩa là fix bắt buộc phải móc vào **cả 3**
nơi đổi `zen-drawer-collapsed` (liệt kê đầy đủ trong `docs/todo/B136-*.md`) — nếu chỉ móc vào một
nơi sẽ sinh ra nguồn sự thật thứ tư lệch pha với 3 nơi kia, đúng loại bug mà #134/#136 đang trả giá.

Cách gọn nhất: một hàm `syncDrawerInert()` duy nhất, gọi sau mọi lần đổi class; hoặc một
`MutationObserver` trên `document.body` để không phụ thuộc việc nhớ gọi. Chọn hàm tường minh nếu
#136 đã gom được các call-site về một chỗ — làm #136 trước sẽ khiến #138 rẻ đi đáng kể.

## Ràng buộc cứng

- **Tuyệt đối không** đặt `inert`/`aria-hidden` lên `.sidebar-tabs` (rail) — đó là cách duy nhất mở
  lại drawer. Chỉ đặt lên `.panel-players` + các `.tab-content`.
- Nếu focus đang nằm trong vùng sắp thành `inert`, phải chủ động trả focus về nút rail tương ứng,
  nếu không focus rơi về `<body>` và người dùng bàn phím mất chỗ đứng.
- Mobile ≤768px: cùng class nhưng cơ chế là `transform: translateY()` trên sheet
  (`room-zen.css:934-958`) — nội dung nằm ngoài màn hình chứ không bị `overflow` cắt, cần **cùng**
  cách xử lý, đừng giới hạn rule theo media query.

## Không cần làm

Không đổi `overflow:hidden` / `justify-content:flex-end` / chiều rộng cố định của `.panel-right`.
Cắt xén là chủ ý (tránh reflow chữ khi drawer co giãn) và comment trong `room-zen.css:408-436` đã
giải thích; #138 chỉ bổ sung nửa còn thiếu về ngữ nghĩa, không đổi cơ chế hình ảnh.

## Test

`client/tests/` (jsdom): decision table class có/không × phần tử nào mang `inert`, cộng một test
khẳng định `.sidebar-tabs` **không bao giờ** bị `inert`. Bước Tab thật (`document.activeElement` sau
mỗi Tab) đo bằng Playwright vì jsdom không mô phỏng thứ tự focus của `inert`.
