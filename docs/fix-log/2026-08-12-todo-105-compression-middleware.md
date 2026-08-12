# Fix log entry — 2026-08-12 08:12

## Prompt

> Proceed TODO task. Do it follow priority

Ưu tiên đã chốt ở lần đo lại trước đó (`docs/fix-log/2026-08-12-do-lai-sau-106-107-108-quyet-dinh-105-109-110.md`):
**#105 → #111 → #109 (cần người dùng quyết) → #110 (đề nghị đóng)**. Đây là mục #105.

## Action

Đọc `docs/instruction/B105-*.md` trước khi làm (đúng quy tắc CLAUDE.md). Nhánh
`fix/compression-middleware` cắt từ **`dev`**, không phải `main`: `git show main:TODO.md` không có
`#105` (thực ra `main` chưa có `TODO.md`), đúng ngoại lệ "tracking entry chỉ tồn tại trên `dev`".

- `npm i compression` → `dependencies` (`^1.8.1`).
- `server/index.js`: `app.use(compression())` đặt **trước** `express.static` và mọi route, sau
  `helmet()`. Kèm comment giải thích phạm vi (vì sao đây không phải fix cho triệu chứng "sometime
  lag" — CF đã nén cho người dùng cuối) để lần sau không ai "hoàn thiện" nhầm.
- Giữ nguyên mặc định `level: 6` và bộ lọc `compressible` — theo đúng mục "Phạm vi KHÔNG làm"
  trong instruction. **Không** đụng `perMessageDeflate` của socket.io.
- `server/tests/compression.test.js`: 14 test, theo khuôn `static-cache-control.test.js` (#106) —
  express mount thật + `http` thô, **không** thêm `supertest`. Dùng `http` thô là bắt buộc chứ
  không phải sở thích: undici tự giải nén và xoá luôn header `Content-Encoding`, mọi assert sẽ
  thành vô nghĩa.

Nhóm case: 3 loại content-type nén được (js/css/html) · giải nén ra **đúng từng byte** so với bản
`identity` (không chỉ "không ném lỗi") · mức nén thật · client `identity` vẫn nhận bytes hợp lệ ·
woff2 **không** bị nén lại · file < 1 KB dưới ngưỡng thì bỏ qua · `Vary: Accept-Encoding` · và
2 test chứng minh không phá #106 (`immutable` / `no-cache` vẫn đúng khi đã gzip).

## Decision

**Phát hiện giữa chừng: 3 test "wiring" đầu tiên là vô nghĩa.** Bộ test tự mount `compression()`
trong harness, nên nó vẫn xanh kể cả khi `server/index.js` không còn dùng middleware này. Đã thêm
3 assert đọc source `index.js` (require + `app.use` + thứ tự trước `express.static`).

Lần đầu 3 assert đó **cũng vẫn vô nghĩa**: regex khớp trúng dòng comment mô tả middleware ngay
phía trên lời gọi thật, nên comment-out dòng `app.use(compression());` vẫn pass. Đã sửa: lọc bỏ
mọi dòng comment trước khi tìm. **Kiểm chứng bằng cách comment tạm dòng thật → đúng 2 test đỏ →
khôi phục.** Không tin "test xanh" mà chưa chứng minh nó biết đỏ.

`index.js` không require được trong Jest (mở DB thật + listen), nên assert theo source là cách khả
thi ở đây, chấp nhận đánh đổi.

## Summary output

`npm test`: **1101/1101 xanh** (trước 1087, +14).

Đo trên server thật (bản tạm cổng 3001 — cố ý không phải 3000 để tunnel đang chạy không phơi bản
tạm ra public; DB thật dời sang bên rồi khôi phục, `md5sum -c` **OK**, còn nguyên 12 users /
64 games; không còn tiến trình server nào do phiên này tạo).

Trang sảnh, 25 request:

| | Bytes |
|---|---|
| trước (không nén) | 570 164 |
| sau (trên dây) | **290 728** |
| tiết kiệm | **279 436 B (−49,0%)** |

Từng file: `phosphor/regular/style.css` 78 080 → 12 370 (−84%) · `index.html` 25 230 → 4 944
(−80%) · `lobby.css` 29 598 → 6 234 (−79%) · `i18n.js` 73 467 → 18 152 (−75%).
`manrope-latin.woff2` **không** có `Content-Encoding` (đúng — đã nén sẵn).

Không hồi quy: `/api/auth/me` vẫn `no-store` (#66), asset vẫn `immutable`, `*.html` vẫn `no-cache`
(#106).

**Nhắc lại kỳ vọng, đừng đọc nhầm con số −49%:** người dùng cuối *đã* được Cloudflare nén Brotli
từ trước. Phần vừa cải thiện là chặng **origin→CF** (đi qua đường upload mạng nhà qua tunnel —
đúng chặng hẹp nhất, và là nơi các đỉnh TTFB ~1s ở #106 xuất hiện) cùng mọi truy cập thẳng vào
origin (dev, Playwright, curl).

**Ngoài phạm vi, chưa xử lý:** server thật vẫn đang tắt, `https://play3cr.dpdns.org` trả 502 —
cần người dùng chạy `bash start.sh`. Fix này chỉ có hiệu lực sau khi server khởi động lại.
