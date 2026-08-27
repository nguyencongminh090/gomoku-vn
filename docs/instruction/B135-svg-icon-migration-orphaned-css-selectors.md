# B135 — Vá CSS selector mồ côi sau migration SVG icon (#129)

Hướng dẫn thực thi cho TODO.md #135 (đã làm — `fix/svg-icon-migration-orphaned-selectors` off `dev`,
2026-08-21).

## Trước khi bắt đầu

- Đọc `docs/todo/B135-*.md` — đặc biệt mục "⚠️ Chưa xác nhận khớp đúng độ lớn báo cáo gốc". Bản sửa
  này sửa một bug **thật nhưng nhỏ** (2px, không tự nó tạo ra hiện tượng "zoom" người dùng báo) tìm
  thấy trong lúc điều tra — **không coi đây là bằng chứng đã giải quyết xong report gốc** cho tới khi
  người dùng xác nhận lại trên máy thật sau hard-refresh.
- Đây là bug **chỉ tồn tại trên `dev`** (nguyên nhân: `TODO.md #129`, migrate markup nhưng không
  audit CSS selector nhắm `i`) — `main` chưa có #129 nên không có bug này. Nhánh `fix/*` off `dev`,
  merge lại `dev`, **không** đụng `main`.

## Cách tiếp cận khi làm

1. Đây là đổi selector thuần (`i` → `.icon`), **không đổi giá trị `font-size`/`display` nào khác** —
   chỉ sửa cái gì đang bị chọn sai, không "nhân tiện" chỉnh lại con số.
2. Quét **toàn bộ** `client/css/*.css` trước khi sửa từng cái một — dùng
   `grep -rnoE '(^|[\s>+~,])i([\s{,]|$)' client/css/*.css | grep -v "\.icon\|@media\|i18n"` để tìm
   hết, tránh sửa xong 1 chỗ rồi báo cáo "đã xong" trong khi còn sót (đã xảy ra 1 lần trong lúc làm
   mục này — ban đầu chỉ thấy 5 chỗ, quét lại tìm thêm chỗ thứ 6 ở `lobby-zen.css`'s
   `.tournament-card__status`).
3. Với mỗi selector `i` mồ côi, xác nhận trước bằng grep/đọc markup thật (không phải mockup — các
   file `*-mockup.html` vẫn giữ `<i class="ph...">` cố ý, đúng theo `CLAUDE.md`'s exception cho 2
   file mockup đông cứng, KHÔNG áp dụng exception đó cho các mockup khác — kiểm tra kỹ file nào thật
   sự là trang sống trước khi coi 1 rule là "mồ côi"): phần tử thật có class đó hiện có mang icon
   `<svg class="icon">` con không. Nếu **không** (như `.btn-create`/`.btn-secondary` — không phần tử
   thật nào dùng class đó với icon) → đó là CSS chết từ trước, **không sửa**, không thuộc phạm vi
   #129.
4. Verify bằng Playwright đo `getBoundingClientRect()` trên **bản dựng tĩnh cô lập**
   (`file://.../client/index.html`, không cần `server/index.js`/DB) TRƯỚC, rồi lặp lại trên
   **production thật** qua đăng nhập khách UI thật (`page.goto('/login.html')` →
   `page.click('#btn-guest')` — theo đúng flow trong `playwright-e2e-safety` skill, không dùng API
   cookie trần) để đối chiếu — **chỉ đo, không tạo phòng/ván**, không đụng DB thật.
5. Bump `?v=N` toàn bộ (đụng `client/css/`), verify bằng
   `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup`.

## Xác minh

- `client/css/` không có hạ tầng test tự động — nói rõ, không bỏ qua âm thầm.
- **Bắt buộc đo trước/sau bằng Playwright** (không chỉ đọc code rồi kết luận) — `git stash` phần CSS
  đã sửa, đo lại, xác nhận số đo đổi đúng hướng (13px → 15px ở ví dụ `.link-action`), rồi pop lại.
- Sau khi deploy, **hỏi lại người dùng** xem hard-refresh có còn thấy icon to bất thường không — nếu
  còn, bug thật vẫn chưa được tìm ra, quay lại điều tra thay vì đóng mục này.
