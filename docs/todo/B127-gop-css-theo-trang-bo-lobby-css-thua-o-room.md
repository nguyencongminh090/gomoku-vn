# #127 — Gộp CSS theo trang (bỏ `lobby.css` thừa ở `room.html`) — ⚠️ đo/xác minh trên domain thật, cần cách ly nghiêm ngặt

**Trạng thái:** chưa làm — **làm SAU CÙNG**, cùng nhóm STRICT với #126, sau #122/#123/#124/#125.

**Nguồn:** review vòng 4 (`gomoku-vn-review-2026-08-14.md` mục 13.7/13.12 #5).

## Vấn đề

`room.html` nạp 9 file CSS chặn render: `main` + `lobby` + `room` + `room-zen` + `game` +
`settings-panel` + 3 file CSS font. Trong đó `lobby.css` (6 593 B) là CSS của trang sảnh, nạp thừa
ở trang phòng — dấu hiệu tách file theo lịch sử phát triển chứ không theo trang thật sự cần gì.

Đối chiếu vcaro (dự án tham chiếu): gộp 1 file. Nhưng review lưu ý **công bằng**: 1 file lớn không
tự động tốt hơn nhiều file nhỏ — nó chỉ bỏ round-trip khám phá, tổng byte CSS 2 bên gần tương đương
(191 KB gomoku-vn vs 162 KB vcaro).

## ⚠️ Vì sao cùng nhóm STRICT với #126

Cùng lý do: người dùng dùng Cloudflare Tunnel forward localhost thật ra domain
`play3cr.dpdns.org` — không có môi trường tách biệt. Thêm rủi ro riêng của việc này: **gộp/tách
CSS rất dễ vỡ layout âm thầm** (selector trùng tên giữa các file, thứ tự cascade đổi khi gộp, class
tưởng không dùng nhưng thật ra có ở trang khác) — không có gì báo lỗi console, chỉ lộ ra bằng mắt.

## Yêu cầu bắt buộc trước khi làm

- **Cách ly + backup nguồn** — giống hệt yêu cầu ở #126 (branch riêng, không sửa trực tiếp bản đang
  phục vụ qua tunnel lúc có người chơi thật, commit sạch trước khi bắt đầu).
- **Kiểm tra kỹ từng trang trước/sau bằng trình duyệt thật, không chỉ đoán** — vì đúng thứ CLAUDE.md
  cảnh báo ("Feature completion checklist... verify UX before calling it done"). Tối thiểu:
  `room.html` ở cả chế độ thường và zen-mode (nếu còn dùng `room-zen.css`), tất cả tab (Chat/Bảng
  điểm/Khán giả/Cài đặt), 2 viewport (desktop + mobile 390×844) — đúng khuôn mẫu xác minh B108/B116
  đã dùng.
- **Xác định trước class nào thật sự dùng ở đâu** — grep `class="..."` trong `room.html` +
  `client/js/room*.js`/`game-ui.js`/`chat-ui.js` đối chiếu với từng file CSS, để biết chắc bỏ
  `lobby.css` khỏi `room.html` không làm mất style nào đang thật sự cần (có thể `room.html` dùng
  vài class chung định nghĩa trong `lobby.css`, không chỉ do lịch sử tách file).

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Hiệu quả:** -8 round-trip khám phá (theo ước tính review), **không phải** giảm byte đáng kể
  (tổng CSS gần như không đổi nếu chỉ gộp).
- **Rủi ro:** **trung bình** — dễ vỡ layout nếu làm ẩu, cần xác minh bằng mắt kỹ hơn #122-#125.
- **Test:** không có Jest cho CSS/layout. Xác minh bằng Playwright thật hoặc `run` skill, theo đúng
  khuôn mẫu B108/B116/B118 (Chromium thật, nhiều viewport, không chỉ sửa rồi đoán).

Chi tiết thực thi: [docs/instruction/B127-gop-css-theo-trang-bo-lobby-css-thua-o-room.md](../instruction/B127-gop-css-theo-trang-bo-lobby-css-thua-o-room.md).
