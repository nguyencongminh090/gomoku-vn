# B129 — Thay Phosphor font bằng SVG sprite

Hướng dẫn thực thi cho TODO.md #129 (chưa làm). Đây là việc **override** quyết định "không làm"
của #108 (xem lý do trong `docs/todo/B129-*.md`) — làm đúng thứ tự dưới đây, **không được nhảy
thẳng vào Giai đoạn 2**.

## Giai đoạn 1 — Audit runtime đầy đủ (bắt buộc trước, không thương lượng)

Mục tiêu: có một tập icon (weight + tên) mà cả 2 phương pháp độc lập dưới đây đều xác nhận — không
tin riêng một phương pháp nào.

### 1a. Grep tĩnh mở rộng — không chỉ tìm class liền kề "ph "/"ph-bold "

Bản grep dùng để phân tích HAR đã bỏ sót `ph-handshake`/`ph-smiley-sad` vì nó chỉ khớp mẫu
`ph(-bold)? ph-xxx` liền nhau. Dùng mẫu rộng hơn, bắt mọi string literal có prefix `ph-`, bất kể
ngữ cảnh:

```
grep -rhoE "['\"\`]ph(-bold)?-[a-z0-9-]+['\"\`]" client/js/*.js | tr -d "'\"\`" | sort -u
grep -rhoE '\bph(-bold)?\s+ph-[a-z0-9-]+' client/*.html | sort -u
```

Sau đó tìm MỌI điểm ghép chuỗi động (không chỉ `tournament-match.js` đã biết) — 3 mẫu:

```
grep -rn 'ph-\${\|`ph-\|["\x27]ph-["\x27] *+\|+ *["\x27]ph-' client/js/*.js
grep -rn '\.ph-\|iconClass\|icon[A-Za-z]*Name\|iconMap\|ICON_' client/js/*.js
```

Với mỗi điểm ghép động tìm được: lần theo biến tới **nguồn gốc** của nó. Nếu nguồn là một hàm/bảng
tra hữu hạn (như `outcomeIconClass()` — trả về đúng 4 literal cố định) → liệt kê thủ công toàn bộ
giá trị có thể, thêm vào tập icon. Nếu nguồn không hữu hạn/không suy ra được tĩnh (vd. tên icon tới
từ dữ liệu server hoặc cấu hình ngoài) → phải audit runtime bắt được đúng đường đó (xem 1b), không
được đoán.

### 1b. Audit runtime bằng Playwright — bắt buộc, không thay bằng "đọc code kỹ hơn"

Grep dù mở rộng đến đâu vẫn chỉ đọc *code*, không đọc *hành vi* — bảng tra động hoặc icon chỉ hiện
ở trạng thái hiếm (lỗi, disconnect, kết quả trận cụ thể) dễ bị người đọc code bỏ sót dù grep đúng.
Viết một script Playwright (tạm, không cần giữ lại như `e2e/*.spec.ts` chính thức trừ khi muốn) làm
việc sau trên **từng trang, từng trạng thái UI có thể tới được**:

```js
const classes = await page.evaluate(() =>
  [...document.querySelectorAll('[class*="ph-"]')]
    .flatMap(el => [...el.classList])
    .filter(c => c.startsWith('ph-') || c === 'ph' || c === 'ph-bold')
);
```

Danh sách trạng thái tối thiểu phải đi qua (không chỉ tải trang mặc định):
- `index.html`: sảnh trống, sảnh có phòng, đang tạo phòng, mở từng tab (Bàn chơi/Giải đấu/Live
  Matches), mở Settings panel.
- `room.html`: trước ván (Swap2 mở), đang chơi, đã có draw offer đang chờ, đã có time-request đang
  chờ, đã có undo-offer đang chờ (B128, mới nhất — dễ bị quên), ván kết thúc (thắng/thua/hoà), vai
  trò spectator, mất kết nối/đang reconnect, mở từng tab settings.
- `tournament.html`, `tournament-detail.html`: danh sách trống/có giải, trạng thái giải mỗi loại
  (chưa bắt đầu/đang chạy/đã kết thúc/đã huỷ), Cross Table, modal tạo giải đấu.
- `tournament-match.html`: **đây là nơi có icon động đã biết** — phải đi hết cả 4 nhánh của
  `outcomeIconClass()` (hoà, thắng, thua, spectator xem `flag-checkered`) ở cả `showResultOverlay`
  (dòng ~721) lẫn series-transition (dòng ~760, `series-transition-icon`) — tạo kết quả trận giả
  lập cho đủ 4 nhánh, không chỉ chơi 1 ván thắng rồi coi là xong.
- `history.html`, `login.html`: các trạng thái lỗi/rỗng nếu có.

Gộp union của mọi lần `classes` thu được trên toàn bộ trạng thái ở trên với kết quả 1a. Đây là tập
icon cuối cùng dùng cho Giai đoạn 2. Nếu 1a và 1b lệch nhau (audit runtime tìm ra icon mà grep tĩnh
không giải thích được, hoặc ngược lại) — dừng lại, tìm hiểu vì sao lệch trước khi tiếp tục, đừng
lấy union rồi bỏ qua.

## Giai đoạn 2 — Build SVG sprite + migrate (chỉ sau khi Giai đoạn 1 xong)

1. Lấy SVG gốc từng icon (đúng weight — `regular`/`bold`) từ `@phosphor-icons/core` (npm) khớp
   đúng version đang vendor trong `client/vendor/phosphor/` — kiểm version trước khi lấy, tránh
   glyph lệch giữa 2 nguồn.
2. Gộp thành 1 file `client/assets/icons/phosphor-sprite.svg`, mỗi icon 1 `<symbol id="ph-{weight}-
   {name}" viewBox="0 0 256 256">`, `fill="currentColor"` trong path. Inline sprite này 1 lần ở đầu
   `<body>` mỗi trang (ẩn bằng `style="display:none"` hoặc thuộc tính `hidden`) để `<use>` tham
   chiếu nội bộ, không tốn thêm request.
3. Thay từng chỗ `<i class="ph[-bold] ph-xxx">` (HTML tĩnh) → `<svg class="icon"><use
   href="#ph-{weight}-{name}"></use></svg>`. Với chỗ ghép động (`tournament-match.js:721,760`), thay
   `className = ...` bằng logic tạo/cập nhật `<use href="#...">` tương ứng — đừng để lại pattern
   ghép chuỗi class cũ song song với SVG mới (dễ tạo ra 2 hệ thống nửa vời).
4. CSS: kiểm hết rule hiện có nhắm `.ph`, `.ph-bold`, `i[class^="ph-"]` (màu, size, margin theo
   từng ngữ cảnh cụ thể — nút, tab, slot card, v.v.) và port sang class `.icon` mới, giữ đúng kích
   thước/màu hiện tại (`width/height: 1em`, `fill: currentColor` để kế thừa `color` cha, như hành
   vi font-icon cũ).
5. Bỏ `<link ... phosphor/regular|bold/style.css>` và `<link rel="preload" as="font" ...
   Phosphor...>` (B123) khỏi từng trang **chỉ sau khi** trang đó xác nhận không còn `<i class="ph...">`
   nào (grep + DOM check, xem Test bên dưới).
6. **Không xoá** `client/vendor/phosphor/**/*.woff2`/`.css` khỏi repo — giữ lại làm đường lùi nếu
   audit Giai đoạn 1 vẫn sót gì đó phát hiện sau khi deploy.
7. Bump `?v=N` — đụng `client/css/`, `client/js/`, `client/*.html`. Chạy đúng lệnh kiểm tra trong
   `CLAUDE.md`:
   ```
   grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup
   ```
   phải ra đúng 1 giá trị `?v=N`.

## Phạm vi KHÔNG làm

- Không đụng `client/vendor/fonts/manrope/` — không liên quan, đã cấu hình đúng.
- Không xoá file font Phosphor gốc khỏi đĩa/repo trong đợt này (xem lý do rollback ở bước 6).
- Không đổi bất kỳ CSS token đã LOCKED nào (theo quy ước design-workflow) khi port style `.ph` →
  `.icon` — chỉ đổi selector/element, giữ nguyên giá trị màu/size.

## Test

- Không có Jest cho phần này (client-side, không có runner). Bắt buộc Playwright thật.
- **Gate hoàn thành khách quan** (không phải "nhìn qua thấy ổn"): sau khi migrate xong 1 trang, chạy
  lại đúng audit ở Giai đoạn 1b trên trang đó — kết quả `classes` phải rỗng (không còn phần tử nào
  mang class `ph-*`/`ph`/`ph-bold`). Song song, `grep -c 'class="ph\|class="[^"]*\bph\b' <trang>`
  qua toàn bộ `client/*.html`/`client/js/*.js` phải về 0 cho những trang đã migrate.
- Đối chiếu ảnh chụp trước/sau cho từng trạng thái đã liệt kê ở Giai đoạn 1b, cả desktop lẫn mobile
  viewport — icon phải giống hệt vị trí/màu/kích thước, không icon nào trống hoặc lệch.
