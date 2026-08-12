# #109 — Production đang chạy ở chế độ dev: `NODE_ENV` không hề được đặt nên phục vụ `client/` thô, và `dist/` thì đã cũ 4 ngày

**Trạng thái:** ✅ ĐÃ XONG (2026-08-12, nhánh `fix/remove-stale-dist-branch`) — **giải bằng cách
XOÁ cái bẫy, không phải bằng cách dựng bước build**

Người dùng đã chọn phương án này sau khi được trình bày cả 3 lựa chọn (xoá `dist/` + bỏ nhánh /
dựng bước build có kiểm chứng / chỉ ghi tài liệu).

**Deviation có chủ ý so với instruction:** `docs/instruction/B109-*.md` ghi rõ "**Không xoá `dist/`
khỏi repo, không đổi `outDir`**". Đây là quyết định của người dùng sau khi cân nhắc đánh đổi, nên
ghi lại thay vì im lặng đi chệch (đúng quy tắc CLAUDE.md). Lý do phương án này thắng:

- Lợi ích còn lại của bundle là **giảm số request** — nhưng #105 (gzip) + #106/#111 (cache) đã
  khiến **lần vào lại tải 0 byte / 0 request**, nên gần như không còn gì để giành.
- Thêm bước build là thêm một thứ **phải nhớ**; bỏ hẳn nhánh thì **không còn bản sao thứ hai của
  client để lệch pha**. Đúng tinh thần "sửa quy trình, không sửa biến env" mà chính instruction
  đặt ra — chỉ khác ở chỗ sửa bằng cách loại bỏ.

**Đã làm:**

- `server/index.js`: `clientPath` giờ luôn là `client/`, bỏ hẳn nhánh
  `NODE_ENV === 'production' ? '../dist' : '../client'`.
- Xoá thư mục `dist/` cục bộ (3.0 MB, 43 file). Lưu ý: `dist/` **không** được git theo dõi (nằm
  trong `.gitignore`), nên đây chỉ là dọn artifact build cục bộ, tái tạo được bằng `npm run build`
  — không phải xoá lịch sử hay code.
- `README.md`: cập nhật phần khởi động, ghi rõ server luôn phục vụ `client/` và output của
  `npm run build` hiện **không được dùng**.
- 4 unit test mới (`server/tests/client-path.test.js`) chặn việc ai đó thêm lại nhánh
  env-conditional — đây là loại "tối ưu" nghe rất hợp lý và sẽ dựng lại đúng cái bẫy này.

**Xác minh:** khởi động server **với `NODE_ENV=production`** (đúng trường hợp trước đây phục vụ
`dist/` cũ) → `/`, `/index.html`, `/js/i18n.js`, `/vendor/socket.io/socket.io.min.js` đều `200`,
và `index.html` trả về có `src="/vendor/socket.io/socket.io.min.js"` — tức đúng `client/` hiện tại
đã gồm #111, không phải bundle cũ. `npm test` **1118/1118 xanh**. DB thật dời sang bên rồi khôi
phục, `md5sum -c` OK.

**Còn để mở, không tự quyết:** `npm run build` + `vite.config.js` + devDependency `vite` vẫn còn
nhưng không ai phục vụ output nữa. Cố ý **không** xoá vì nằm ngoài phạm vi người dùng đã chốt —
nếu muốn dọn nốt thì mở mục riêng.

Chi tiết: [docs/fix-log/2026-08-12-todo-109-remove-stale-dist-branch.md](../fix-log/2026-08-12-todo-109-remove-stale-dist-branch.md).

`server/index.js:63-66` chọn thư mục tĩnh theo `NODE_ENV`:

```js
const clientPath = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, '..', 'dist')
  : path.join(__dirname, '..', 'client');
```

Nhưng `start.sh` (script khởi động thật, đang chạy production qua tunnel) chạy `npm run dev:stable`
= `node server/index.js`, **không export `NODE_ENV` ở bất kỳ đâu**, và `.env` cũng không có dòng
`NODE_ENV=`. Xác nhận trên tiến trình đang chạy thật:

```
$ cat /proc/582452/environ | tr '\0' '\n' | grep -i node_env
(không có kết quả)
```

Nghĩa là **domain thật `play3cr.dpdns.org` đang phục vụ `client/` thô** — không minify, không bundle,
không tree-shake, không code-split. Đây là lý do gốc vì sao đường tới hạn của trang sảnh là **26
request riêng lẻ / 878 KB** thay vì vài bundle đã gộp.

## Nhưng KHÔNG được sửa bằng cách chỉ đặt `NODE_ENV=production`

`dist/` hiện đã cũ:

```
dist/index.html      2026-08-08 09:09
client/index.html    2026-08-12 00:08     ← mới hơn 4 ngày
```

`vite build` lần cuối chạy ngày 08-08. Từ đó tới nay `client/` đã đổi nhiều (ít nhất #103 luật WALL,
#104 fix touch mobile, và toàn bộ đợt OAuth #95-#102). **Đặt `NODE_ENV=production` ngay bây giờ sẽ
làm production quay ngược về bản build ngày 08-08, mất hết các fix gần đây** — tức là biến một vấn đề
hiệu năng thành một sự cố chức năng.

Đây đúng lớp lỗi mà CLAUDE.md ("Root-cause diagnosis") đã ghi làm tiền lệ: #65 từng sửa CSP đúng ở
`client/` nhưng `dist/` vẫn cũ và vẫn ship HTML có lỗ hổng — không có gì xác minh artifact **đã
build** khớp với nguồn.

## Vấn đề thật là quy trình, không phải một biến môi trường

Không có bước nào — trong `start.sh`, trong `package.json` scripts, hay trong CI — đảm bảo `dist/`
được build lại trước khi phục vụ. `npm run build` là việc thủ công mà không ai bị nhắc phải làm.
Chừng nào còn vậy thì `NODE_ENV=production` luôn là một quả mìn hẹn giờ, bất kể lần này có build tay
trước hay không.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Hiệu quả tiềm năng: cao** (bundle + minify + code-split thay cho 26 file thô), nhưng **thấp hơn
  #106 về tỉ lệ lợi ích/rủi ro** — #106 sửa được mà không đụng gì tới đường build.
- **Rủi ro: cao nhất trong nhóm #105-#110.** Đổi cả cơ chế phục vụ file của production. `vite.config.js`
  có plugin `copyClassicScripts()` tự tay xử lý các `<script>` non-module (đã từng 404 ở production
  một lần — xem comment trong chính file đó và #65); mọi thay đổi đều phải xác minh trên artifact
  build thật, không chỉ trên `client/`.
- **Thứ tự đề xuất: làm SAU #105-#108.** Bốn mục kia đều sửa trực tiếp trên `client/` với rủi ro
  thấp, và lợi ích của chúng **không mất đi** khi sau này chuyển sang `dist/` (Vite giữ nguyên
  `<link>`/`<script>` đã bỏ bớt, header cache và compression nằm ở tầng Express không phụ thuộc thư
  mục nào). Ngược lại, làm #109 trước sẽ khiến việc đo hiệu quả của #105-#108 khó tách bạch.
- **Bắt buộc phải hỏi người dùng trước khi đổi** — đây là thay đổi cách production phục vụ, và người
  dùng là người khởi động/vận hành server (`start.sh`), không phải agent.

Chi tiết: [docs/instruction/B109-production-chay-che-do-dev-dist-cu.md](../instruction/B109-production-chay-che-do-dev-dist-cu.md).
