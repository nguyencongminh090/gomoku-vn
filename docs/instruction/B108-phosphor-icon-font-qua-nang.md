# B108 — Giảm tải font icon Phosphor

Hướng dẫn thực thi cho TODO.md #108 (chưa làm). Mục này có **3 phần rủi ro rất khác nhau** — làm
theo đúng thứ tự, đừng gộp.

## Giai đoạn 1 — (a) bỏ weight `bold` ở 3 trang không dùng + (c) `font-display` (rủi ro thấp)

- Bỏ `<link ... phosphor/bold/style.css ...>` khỏi `client/index.html`, `client/login.html`,
  `client/tournament.html`. **Giữ ở `client/room.html`** (có 2 chỗ dùng `ph-bold` thật).
- Trước khi bỏ, **kiểm lại từng trang bằng grep chứ không tin bảng trong file TODO** — class có thể
  được sinh động từ JS mà trang đó nạp:
  ```
  grep -rn "ph-bold" client/index.html client/login.html client/tournament.html
  grep -rn "ph-bold" client/js/*.js     # rồi đối chiếu file nào được trang nào nạp
  ```
  Nếu một module JS dùng `ph-bold` và được nạp bởi một trong 3 trang trên thì trang đó **không** được
  bỏ link.
- Đổi `font-display: block` → `swap` trong `client/vendor/phosphor/regular/style.css` (và
  `bold/style.css` nếu vẫn giữ). Khớp với `manrope/style.css` vốn đã dùng `swap`.
- **Bump `?v=N`** — có đụng `client/vendor/` (được tham chiếu với `?v=`) và các `<link>` trong HTML.
  Chạy đúng lệnh kiểm tra trong CLAUDE.md, phải ra đúng một giá trị `?v=N`:
  ```
  grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup
  ```

## Giai đoạn 2 — (b) subset font xuống 45 icon (rủi ro cao, cân nhắc kỹ)

- **Đừng subset dựa trên con số 45 trong file TODO.** Con số đó từ grep tĩnh
  (`grep -rhoE '\bph-[a-z0-9-]+'`) và **không bắt được class ghép chuỗi** kiểu
  `` `ph-${iconName}` `` hay bảng tra icon trong JS. Trước khi subset, phải:
  1. Grep tìm mọi chỗ ghép chuỗi: `grep -rn 'ph-\${\|"ph-" *+\|`ph-' client/js/*.js`
  2. Nếu tìm thấy bất kỳ chỗ nào ghép động → liệt kê thủ công toàn bộ giá trị có thể của biến đó,
     hoặc **bỏ hẳn giai đoạn 2** (không đáng rủi ro).
- Chế độ hỏng của mục này là **im lặng**: icon thiếu không sinh lỗi console, không fail test, chỉ là
  một ô trống mà không ai để ý cho tới khi người dùng báo. Nếu không chắc chắn 100% đã liệt kê đủ,
  giá trị đúng của việc này là **không làm**.
- Nếu vẫn làm: giữ lại file font gốc trong repo (đừng ghi đè), thêm file subset cạnh nó, để có thể
  quay lại bằng một dòng.

## Phạm vi KHÔNG làm

- **Không thay Phosphor bằng thư viện icon khác**, không chuyển sang inline SVG — đó là thay đổi
  thiết kế/kiến trúc, không phải tối ưu tải trang; ngoài phạm vi báo cáo người dùng.
- Không đụng `client/vendor/fonts/manrope/` — đã cấu hình đúng (`font-display: swap`, 3 file subset
  theo `unicode-range`, tổng ~48 KB). Không có gì để sửa ở đó.
- Không xoá file `.woff`/`.ttf` fallback trong `vendor/phosphor/` — chúng chỉ được tải khi trình
  duyệt không hỗ trợ `.woff2` (thực tế gần như không bao giờ), không nằm trên đường tới hạn, và xoá
  đi chỉ tiết kiệm dung lượng repo chứ không tiết kiệm băng thông người dùng.

## Test

- Không có test tự động (client-side, repo chưa có runner cho `client/js/`).
- Xác minh thủ công: mở **cả 4 trang** trong trình duyệt thật, ở **cả desktop lẫn mobile viewport**,
  đối chiếu từng icon với ảnh chụp trước khi sửa. Đây là loại thay đổi mà "trang vẫn load được"
  hoàn toàn không chứng minh được gì — phải nhìn từng icon.
