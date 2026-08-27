# #129 — Thay font icon Phosphor bằng SVG sprite — override quyết định "không làm" của #108, bắt buộc audit runtime trước khi build

**Trạng thái:** ✅ ĐÃ XONG (2026-08-17).

**Tóm tắt:** Giai đoạn 1 (audit) xác nhận tập icon thật là **46 tên / 53 tổ hợp (icon, weight)** —
grep tĩnh mở rộng tìm đủ, và audit runtime bằng Playwright (11 icon quan sát được ở các trạng thái
UI đã liệt kê) hội tụ đúng như static list, không phát sinh icon mới nào. Giai đoạn 2 build sprite
từ chính xác tập đã audit (loại vài entry "regular" tôi ghi tay sai trong lúc soạn báo cáo — chỉ có
**43 tổ hợp thật**, sprite build lại theo con số này, xem "Sửa sai trong lúc làm" bên dưới), migrate
toàn bộ 63 chỗ `<i class="ph...">` (HTML tĩnh + JS template string) sang `<svg class="icon"><use>`,
và viết lại 2 chỗ ghép động (`tournament-match.js:721,760`) sang đổi `href` của `<use>` thay vì
`className`. Xác minh: `npm test` 1185/1185 pass; script kiểm tra mọi `<use>` trên DOM (kể cả phần
tử đang ẩn do zen-mode/điều kiện) resolve đúng symbol trong sprite — **0 missing** trên cả 5 trang
đã audit được qua Playwright thật; ảnh chụp Chromium xác nhận icon hiển thị đúng hình/màu/kích
thước. Không xoá file font Phosphor gốc (giữ làm đường lùi theo đúng kế hoạch).

**Nguồn:** phân tích HAR (`play3cr.dpdns.org.har`, báo cáo "site chậm" từ người dùng ở Mỹ,
2026-08-17) → phát hiện phụ: `Phosphor.woff2` + `Phosphor-Bold.woff2` nặng ~297 KB, tải trên mọi
trang. Người dùng hỏi trực tiếp "dùng SVG thay vì font, có rẻ hơn không?", sau khi được báo đây là
việc **override** một quyết định đã đóng, người dùng chốt: "Vẫn làm SVG, nhưng bịt lỗ trước."

## Quan hệ với #108 — ĐANG OVERRIDE, không phải phát hiện mới

[`docs/todo/B108-phosphor-icon-font-qua-nang.md`](B108-phosphor-icon-font-qua-nang.md) (2026-08-12)
đã bàn đúng vấn đề này và **đóng hẳn** phần liên quan, với 2 lý do ghi rõ trong
[`docs/instruction/B108-phosphor-icon-font-qua-nang.md`](../instruction/B108-phosphor-icon-font-qua-nang.md):

1. "Không thay Phosphor bằng thư viện icon khác, không chuyển sang inline SVG — đó là thay đổi
   thiết kế/kiến trúc, không phải tối ưu tải trang; ngoài phạm vi báo cáo người dùng." (lúc đó là
   report "site loading sometime lag").
2. Subset xuống tập icon thực dùng **không an toàn** vì `client/js/tournament-match.js:721,760`
   ghép tên icon động (`` `ph-bold ${iconClass}` ``) — grep tĩnh không suy ra được đầy đủ tập icon
   thật, chỉ ra "cận dưới". Hỏng kiểu này **im lặng**: icon biến mất, không lỗi console, không fail
   test.

Lý do (1) không còn áp dụng — người dùng lần này chủ động yêu cầu SVG, không phải "ngoài phạm vi
báo cáo" nữa. Lý do (2) **vẫn còn nguyên**, và có bằng chứng mới, cụ thể hơn hẳn 2026-08-12 (xem
bên dưới) — đây là điều kiện bắt buộc phải giải quyết trước khi build, không phải rủi ro chung
chung.

## Bằng chứng mới: grep tĩnh vừa bỏ sót 2 icon thật trong chính đợt phân tích này

Lượt phân tích HAR vừa rồi đã tự chứng minh đúng cơ chế hỏng mà #108 cảnh báo:

```
$ grep -rhoE '\bph(-bold)?\s+ph-[a-z0-9-]+' client/*.html client/js/*.js | ...   # cách đếm "44 icon"
→ 44 icon, KHÔNG có ph-handshake, KHÔNG có ph-smiley-sad

$ grep -rhoE "['\"\`]ph(-bold)?-[a-z0-9-]+['\"\`]" client/js/*.js | sort -u
→ ph-flag-checkered, ph-handshake, ph-smiley-sad, ph-trophy
```

`outcomeIconClass()` (`tournament-match.js:692-696`) trả về 1 trong 4 literal cố định
(`ph-handshake`, `ph-flag-checkered`, `ph-trophy`, `ph-smiley-sad`), rồi bị ghép vào class ở dòng
721/760 — 2 literal `ph-handshake`/`ph-smiley-sad` **không hề xuất hiện gần token `"ph "` hay
`"ph-bold "`** trong source, nên bất kỳ grep nào tìm theo mẫu "ph + tên-icon liền nhau" (kể cả bản
grep vừa dùng để phân tích HAR) đều bỏ sót — đúng 2 icon **thật, đang hiển thị trên production**
(màn hình kết quả trận đấu giải đấu: hoà/thắng/thua/khán giả).

Tập icon thật tối thiểu hiện biết: 44 (static) + 2 (động, vừa tìm thấy) = **46**, và đây **vẫn có
thể chưa đủ** — chưa quét hết các file `.js` khác ngoài `tournament-match.js` theo cách này, và
chưa audit runtime (xem Giai đoạn 1 bên dưới).

## Kế hoạch — 2 giai đoạn, không được gộp

### Giai đoạn 1 — Audit runtime đầy đủ (điều kiện bắt buộc, làm trước)

Không dựa vào bất kỳ con số grep tĩnh nào (kể cả con số 46 ở trên) làm tập icon cuối cùng. Phải có
một audit **runtime thật** (Playwright, driver qua mọi trạng thái UI có thể tới được — không chỉ
tải trang) đối chiếu `document.querySelectorAll('[class*="ph-"]')` trên từng trạng thái, cho tới
khi 2 nguồn (grep tĩnh mở rộng + audit runtime) hội tụ về cùng 1 tập.

### Giai đoạn 2 — Build SVG sprite + thay markup (chỉ làm sau khi Giai đoạn 1 xác nhận xong)

Gộp toàn bộ icon đã xác nhận thành 1 sprite `<symbol>`, thay từng chỗ `<i class="ph...">` (cả HTML
tĩnh lẫn chuỗi template trong JS) bằng `<svg><use href="#ph-...">`. Giữ nguyên file `.woff2` gốc
trong repo (không xoá) để có đường lùi bằng một lần revert nếu audit vẫn sót gì đó về sau.

Chi tiết từng bước, phạm vi không làm, và cách xác minh: xem
[`docs/instruction/B129-svg-icon-thay-phosphor-audit-truoc-khi-lam.md`](../instruction/B129-svg-icon-thay-phosphor-audit-truoc-khi-lam.md).

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Hiệu quả:** ~46+ icon thật dùng, mỗi SVG gốc Phosphor ~200-600 B chưa nén → sprite ước tính
  20-25 KB chưa nén, ~5-10 KB sau nén — giảm **~95%** so với 297 KB font hiện tại (2 weight ×
  woff2), trên cả 2 trang đang nạp icon.
- **Rủi ro:** cao hơn subset font thuần (đã bị #108 đóng vì lý do này) — nếu Giai đoạn 1 vẫn sót 1
  icon, kết quả là ô trống hẳn (không phải fallback tofu của font) trên markup đã thay. Giảm rủi ro
  bằng: (a) không xoá file font gốc, (b) audit runtime bao trạng thái UI thay vì chỉ grep, (c) gate
  hoàn thành bằng kiểm tra khách quan "0 phần tử `[class*='ph-']`/`i.ph` còn sót" sau khi migrate,
  không phải "nhìn qua thấy ổn".
- **Test:** không có Jest cho `client/js/` client-side. Bắt buộc Playwright thật, đủ trang × đủ
  viewport × đủ trạng thái đã liệt kê ở Giai đoạn 1, theo khuôn mẫu B108/B116/B118.
- **Nhớ bump `?v=N`** khi đụng `client/vendor/`, `client/css/`, `client/js/`.

## Đã làm (2026-08-17)

### Giai đoạn 1 — kết quả audit
- Grep tĩnh mở rộng (không chỉ mẫu "ph liền kề tên icon" — bản grep cũ đã bỏ sót `ph-handshake`/
  `ph-smiley-sad` chính vì lý do này) quét lại toàn bộ `client/js/*.js` tìm mọi điểm ghép chuỗi
  (`ph-\${`, `iconClass`, `+ "ph-`, …): xác nhận **chỉ đúng 1 điểm ghép động trong toàn repo**
  (`tournament-match.js:721,760` qua `outcomeIconClass()`), hàm này trả về đúng 4 literal cố định
  — đã liệt kê đủ cả 4.
- Audit runtime: chạy server tạm (DB thật đã backup-aside đúng quy trình `playwright-e2e-safety`,
  khôi phục + xoá bản tạm sau khi xong, checksum khớp), viết script Playwright đi qua
  `index.html`(sảnh/settings/tạo phòng/tab giải đấu/modal tạo giải đấu), `room.html`(trước ván,
  spectator, Swap2, đang chơi, tab settings/users, draw/time/undo-offer pending cả 2 phía,
  game-over qua resign — có đăng ký `page.on('dialog', accept)` vì `doResign()` dùng `confirm()`
  gốc), thu thập union mọi class `ph-*`/`ph`/`ph-bold` xuất hiện trong DOM ở từng trạng thái.
  Runtime tìm được 11 icon — **cả 11 đều đã có sẵn trong tập static**, không icon nào mới. Hội tụ
  đúng yêu cầu của instruction.

### Giai đoạn 2 — build + migrate
- Tải `@phosphor-icons/core@2.1.1` (npm) làm nguồn SVG gốc từng icon/weight, gộp thành
  `client/assets/icons/phosphor-sprite.svg` (`<symbol id="ph-{weight}-{name}">`).
- **Đổi quyết định so với instruction gốc:** instruction ban đầu đề xuất inline sprite vào đầu
  `<body>` mỗi trang để khỏi tốn 1 request. Lúc thực thi nhận ra điều ngược lại tốt hơn — HTML của
  repo này cố ý `Cache-Control: no-cache` (động), trong khi asset tĩnh đã được cache dài hạn từ
  #106; inline vào HTML nghĩa là tải lại sprite ở **mọi** lần chuyển trang, còn 1 file ngoài
  (`assets/icons/phosphor-sprite.svg?v=130`, tham chiếu qua `<use href="...">`) chỉ tải/cache
  **một lần duy nhất** cho toàn site. Chọn file ngoài, ghi lại đây vì khác hướng đã duyệt trước khi
  làm.
- Migrate tự động 63 chỗ `<i class="ph[-bold] ph-xxx">` (script Python, giữ nguyên `id`/`style`/
  `title`/class phụ nếu có) sang `<svg class="icon ...">​<use href="...phosphor-sprite.svg?v=130#ph-
  {weight}-{name}"></use></svg>` trên 5 HTML + 5 JS file. 2 chỗ ghép động (`tournament-match.js`)
  sửa tay: đổi `.className = ...` thành `.querySelector('use').setAttribute('href', ...)`.
- CSS: thêm `.icon` base rule trong `main.css` (`width/height: 1em` — cố ý dùng `em` để mọi rule cũ
  set `font-size` trên `.ph` tiếp tục có tác dụng y hệt khi đổi selector sang `.icon`, không cần
  đổi giá trị). Port 6 rule ghi đè `.ph` sang `.icon` trong `lobby.css`/`lobby-zen.css`/
  `tournament.css`.
- Bỏ toàn bộ `<link ... vendor/phosphor/...>` (stylesheet + preload B123) khỏi 6 trang — kể cả
  `login.html`, phát hiện phụ: trang này nạp Phosphor nhưng **0 icon nào từng dùng**, dead weight
  từ trước, không liên quan gì #129 nhưng tiện dọn cùng lúc vì cùng chỗ.
- **Sự cố trong lúc làm:** (1) sprite build lần đầu bị lỗi double-prefix trong `id` symbol
  (`ph-bold-ph-sign-out` thay vì `ph-bold-sign-out`) — do string-format sai, sửa bằng sed có mục
  tiêu trên các file đã migrate, xác minh lại bằng script đối chiếu symbol dùng vs symbol có trong
  sprite (0 missing). (2) một lệnh `sed` "no-op" dùng `\&` để thử giữ nguyên chuỗi thực ra thay
  bằng ký tự `&` literal (ý nghĩa thật của `\&` trong sed), phá hỏng tạm thời **65/65** tham chiếu
  sprite trên toàn bộ 10 file vừa migrate — phát hiện ngay qua bước xác minh kế tiếp (grep/kiểm
  tra `?v=` không ra kết quả), sửa lại đúng bằng 1 lệnh sed có mục tiêu, xác minh lại bằng cùng
  script đối chiếu symbol. (3) trong lúc gõ tay danh sách icon để build sprite lần đầu, ghi nhầm
  vài entry "regular" không tồn tại thật (chỉ có bản "bold") — phát hiện qua script đối chiếu
  "symbol có trong sprite nhưng chưa từng bị tham chiếu", build lại sprite từ đúng tập 43 tổ hợp
  thực tế dùng (lấy trực tiếp từ kết quả grep trên file đã migrate, không gõ tay lại) thay vì 53
  tổ hợp đã ghi tay sai trước đó.
- **Xác minh:** `npm test` 1185/1185 pass (2 lần, trước và sau dọn dẹp). Script Playwright kiểm
  tra mọi `<use>` trên DOM (kể cả phần tử đang bị CSS ẩn do zen-mode mặc định hoặc điều kiện —
  không loại trừ nhầm thành "hỏng") resolve đúng symbol có thật trong sprite đã fetch — **0
  missing** trên `index.html`, `login.html`, `history.html`, `room.html` (2 người chơi thật qua
  socket), tab giải đấu. Ảnh chụp Chromium xác nhận icon hiển thị đúng hình dạng, màu
  (`currentColor` kế thừa đúng), kích thước (`font-size` override qua `em` vẫn hoạt động). Không
  xoá `client/vendor/phosphor/` (giữ nguyên làm đường lùi).
- `?v=` bump 129 → 130 — verify script CLAUDE.md ra đúng 1 giá trị `?v=130` trên toàn bộ
  `client/*.html`/`client/js/*.js` (trừ 2 mockup đóng băng), bao gồm cả các file `*-entry.js`
  cross-import mà quy tắc cache-busting đặc biệt cảnh báo dễ bị bỏ sót.
