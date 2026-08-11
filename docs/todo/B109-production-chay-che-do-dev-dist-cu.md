# #109 — Production đang chạy ở chế độ dev: `NODE_ENV` không hề được đặt nên phục vụ `client/` thô, và `dist/` thì đã cũ 4 ngày

**Trạng thái:** chưa làm

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
