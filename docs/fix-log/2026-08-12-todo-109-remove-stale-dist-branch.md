# Fix log entry — 2026-08-12 09:05

## Prompt

> Proceed TODO task. Do it follow priority

Mục cuối cần code trong nhóm #105-#111. Trước khi làm đã hỏi người dùng đúng như instruction bắt
buộc ("phải hỏi người dùng trước — họ vận hành server thật"), đưa 3 phương án; người dùng chọn
**xoá `dist/` + bỏ nhánh**. Cùng lượt đó người dùng chốt **đóng #110**.

## Action

- `server/index.js`: `clientPath` luôn là `client/`; bỏ hẳn
  `process.env.NODE_ENV === 'production' ? '../dist' : '../client'`.
- Xoá thư mục `dist/` cục bộ (3.0 MB / 43 file). `dist/` nằm trong `.gitignore`, **không được git
  theo dõi** — nên đây là dọn artifact build cục bộ, tái tạo được bằng `npm run build`, không phải
  xoá code hay lịch sử.
- `README.md`: bỏ mô tả "serves `dist/` once `NODE_ENV=production`", ghi rõ server luôn phục vụ
  `client/` và output của `npm run build` hiện không được dùng.
- `server/tests/client-path.test.js`: 4 test chặn việc thêm lại nhánh env-conditional. Có test
  riêng khẳng định `clientPath` không phụ thuộc `NODE_ENV`, nhưng **chỉ soi đúng câu lệnh gán** —
  `NODE_ENV` vẫn được dùng hợp lệ chỗ khác (mặc định CORS của socket.io), cấm sạch sẽ là sai.
  Lọc bỏ dòng comment trước khi assert, cùng lý do đã học ở #105: đoạn comment ngay trên chỗ code
  nói rất nhiều về `dist/` và `NODE_ENV`, không lọc thì mọi assert đều khớp nhầm.

## Decision

**Deviation có chủ ý so với instruction, ghi lại thay vì im lặng.** `docs/instruction/B109-*.md`
ghi "**Không xoá `dist/` khỏi repo, không đổi `outDir`**" và đề xuất tối thiểu là thêm
`npm run build` vào `start.sh`. Người dùng chọn hướng ngược lại sau khi được trình bày đánh đổi.
Lý do phương án xoá thắng:

- Lợi ích còn lại của bundle là giảm số request, nhưng #105 (gzip) + #106/#111 (cache) đã đo được
  **lần vào lại 25/25 resource từ cache, 0 byte qua mạng**. Gần như không còn gì để giành.
- Thêm bước build = thêm thứ phải nhớ và một chế độ hỏng mới. Bỏ nhánh = **không còn bản sao thứ
  hai của client để lệch pha**. Vẫn đúng tinh thần "sửa quy trình chứ không sửa biến env" mà chính
  instruction đặt ra — chỉ là sửa bằng cách loại bỏ.

**Cố ý KHÔNG làm:** không xoá `npm run build`/`vite.config.js`/devDep `vite`. Nằm ngoài phạm vi
người dùng đã chốt; đã ghi vào `docs/todo/B109-*.md` như việc còn để mở. Cũng không đụng
`copyClassicScripts()` — instruction cấm, và giờ càng không có lý do.

**#110 đóng, không sửa** — xem `docs/todo/B110-*.md` cho bảng số đo đầy đủ. Tóm tắt: tách từ điển
chỉ tiết kiệm **4 795 B** brotli (thấp hơn ước tính 8-9 KB của chính mục đó), ≈0,8% trang sảnh,
lại nằm trên asset `immutable` chỉ tải một lần sau #106 — không đáng đổi lấy việc biến `i18n.js`
thành bất đồng bộ ở rất nhiều call site.

## Summary output

`npm test`: **1118/1118 xanh** (trước 1114, +4).

**Xác minh đúng trường hợp từng hỏng:** khởi động server **với `NODE_ENV=production`** — trước đây
đây chính là lệnh phục vụ `dist/` cũ 4 ngày. Kết quả: `/`, `/index.html`, `/js/i18n.js`,
`/vendor/socket.io/socket.io.min.js` đều **200**, và `index.html` trả về chứa
`src="/vendor/socket.io/socket.io.min.js"` → đúng `client/` hiện tại (đã có #111), không phải
bundle cũ. Đây là điểm mấu chốt: `dist/` cũ **không** có đường dẫn đó.

DB thật dời sang bên rồi khôi phục, `md5sum -c` **OK**; không còn tiến trình server nào của phiên
này.

**Ngoài phạm vi, chưa xử lý:** server thật vẫn đang tắt, `https://play3cr.dpdns.org` trả **502** —
cần người dùng chạy `bash start.sh`. Toàn bộ nhóm #105-#111 chỉ có hiệu lực sau khi khởi động lại.
