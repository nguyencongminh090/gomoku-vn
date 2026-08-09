# Phần B #89. `npm audit` báo 3 lỗ hổng high-severity ở dependency gián tiếp

**Nguồn:** phát hiện phụ khi cài `jest-environment-jsdom` cho TODO.md #88's follow-up unit test
(2026-08-09) — `npm install` in lại `npm audit` sau khi thêm gói, lộ ra 3 cảnh báo **đã tồn tại từ
trước**, không liên quan tới gói mới thêm.

## Đã xác nhận qua `npm ls`/`npm view` (không chỉ tin theo `npm audit` báo cáo)

| Gói lỗ hổng | Version hiện tại | Advisory | Đến từ |
|---|---|---|---|
| `js-yaml` 3.0.0–3.15.0 | 3.15.0 | [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) — Quadratic CPU consumption ở `!!omap` resolution (CVE-2026-59870, fix chưa backport về 3.x) | `jest` → `@jest/core` → `@jest/transform` → `babel-plugin-istanbul` → `@istanbuljs/load-nyc-config` |
| `nanoid` <3.3.17 | 3.3.16 | [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) — custom generator lặp vô hạn khi `size=0` | `vite` → `postcss` |
| `socket.io-parser` 4.0.0–4.2.6 | 4.2.6 | [GHSA-2m8v-j782-fhvr](https://github.com/advisories/GHSA-2m8v-j782-fhvr) — Zero-attachment Memory Exhaustion | `socket.io`@^4.7.4 (production `dependencies`) **và** `socket.io-client`@^4.8.3 (`devDependencies`, dùng cho test) |

Đã xác nhận (`npm ls jest-environment-jsdom` gián tiếp qua cây phụ thuộc) — **không cái nào trong 3
cái này đến từ `jest-environment-jsdom` vừa thêm ở #88**; cả 3 đều có từ trước, chỉ tình cờ lộ ra
lúc `npm install` chạy audit lại.

## Đánh giá mức độ nghiêm trọng thật (không chỉ theo nhãn "high" của advisory)

- **`socket.io-parser` — mức ưu tiên cao hơn 2 cái còn lại.** `socket.io` là dependency PRODUCTION
  thật (`package.json`'s `dependencies`, không phải `devDependencies`) — đây là tầng transport
  thời gian thực server đang chạy, nhận kết nối từ internet thật qua Cloudflare Tunnel (xem
  `CLAUDE.md`'s ghi chú hạ tầng). Một lỗ hổng DoS "memory exhaustion" ở đúng gói parse message của
  transport này có khả năng tiếp cận trực tiếp từ bất kỳ client nào kết nối — cần xử lý nghiêm túc,
  không chỉ vì nhãn severity.
- **`js-yaml`/`nanoid` — rủi ro thực tế thấp hơn nhiều.** Cả 2 đều chỉ nằm trong `devDependencies`
  (`jest`, `vite`) — không được bundle/ship vào server production hay client build output, và
  không xử lý input từ người dùng chưa tin cậy trong cách dự án đang dùng chúng (jest's coverage
  config parsing YAML nội bộ, không phải input động; vite build-time, không chạy trên request thật
  của người dùng cuối). Vẫn nên dọn vì miễn phí (transitive, sẽ dedupe tự nhiên khi upstream bump),
  nhưng không khẩn như `socket.io-parser`.

## CHƯA ĐO ĐƯỢC / cần làm rõ trước khi sửa

- `npm audit fix --dry-run` báo "changed 3 packages" nhưng NGAY SAU ĐÓ vẫn in lại đúng 3 cảnh báo
  y hệt trong phần report của chính nó — không rõ đây là do dry-run luôn in lại toàn bộ báo cáo bất
  kể có sửa được hay không (không phản ánh trạng thái SAU khi fix), hay do thật sự không tự sửa
  được trong range semver hiện tại. `socket.io-parser@4.2.7` (bản đã vá) NẰM TRONG range
  `socket.io@4.8.3`'s khai báo phụ thuộc `~4.2.4` (tức `>=4.2.4 <4.3.0`) — về lý thuyết resolve
  được không cần bump major/`--force`, nhưng `package-lock.json` hiện khoá ở `4.2.6`. Cần chạy thật
  `npm audit fix` (không phải `--dry-run`) trên 1 branch riêng, rồi `npm ls socket.io-parser` xác
  nhận có lên `4.2.7` không, trước khi biết đây là việc 1 dòng lệnh hay cần bump `socket.io` lên
  version mới hơn.

## Việc cần làm

Xem hướng dẫn chi tiết: [docs/instruction/B89-npm-audit-3-high-severity-transitive.md](../instruction/B89-npm-audit-3-high-severity-transitive.md).

## Trạng thái

Chưa làm.
