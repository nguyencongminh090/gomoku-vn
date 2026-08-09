# Fix log entry — 2026-08-09 13:06

## Prompt

"Do #89" — thực hiện `docs/todo/B89-npm-audit-3-high-severity-transitive.md` /
`docs/instruction/B89-npm-audit-3-high-severity-transitive.md`: `npm audit` báo 3 lỗ hổng
high-severity ở dependency gián tiếp có từ trước (`js-yaml` qua `jest`, `nanoid` qua `vite`,
`socket.io-parser` qua `socket.io`/`socket.io-client`).

## Action

Item #89's tracking entry (`TODO.md`/`instruction.md`) chỉ tồn tại trên `dev` (chưa merge lên
`main`), nên theo ngoại lệ branching trong `CLAUDE.md`, nhánh fix branch off `dev`:
`fix/npm-audit-socketio-parser` (từ `dev`, xác nhận bằng `git show main:TODO.md | grep '#89'` →
không có kết quả).

Chạy `npm ls socket.io-parser js-yaml nanoid` trước để xác nhận version hiện tại khớp đúng bảng đã
ghi ở #89 (`socket.io-parser@4.2.6`, `js-yaml@3.15.0`, `nanoid@3.3.16`). Sau đó chạy
`npm audit fix` (không `--dry-run`, không `--force`) một lần — resolve được cả 3 gói cùng lúc,
chỉ đổi `package-lock.json` (9 dòng thêm/10 dòng bớt), **không đổi `package.json`** — tức không
cần bump `jest`/`vite`/`socket.io`/`socket.io-client` version khai báo, chỉ transitive patch bump:

| Gói | Trước | Sau |
|---|---|---|
| `socket.io-parser` | 4.2.6 | 4.2.7 |
| `js-yaml` | 3.15.0 | 3.15.1 |
| `nanoid` | 3.3.16 | 3.3.18 |

`npm audit` sau fix → "found 0 vulnerabilities". `npm ls` xác nhận lại đúng 3 version mới ở trên
(không chỉ tin `npm audit`'s "0 vulnerabilities" theo đúng bẫy đã ghi ở `instruction.md`).

## Decision

Vì cả 3 gói đều resolve semver-safe, không gói nào cần `--force`/bump major, và `npm audit fix`
tự nhiên gộp cả 3 vào cùng 1 lần chạy/1 lockfile diff — gộp chung 1 commit trên
`fix/npm-audit-socketio-parser`, không tách riêng `socket.io-parser` khỏi `js-yaml`/`nanoid` như
instruction.md dự trù cho trường hợp "một trong 3 cần bump major" (không xảy ra ở đây, nên điều
kiện "không gộp" không áp dụng).

`npm test` (toàn bộ 41 suites / 977 tests) chạy xanh sau fix — xác nhận không vỡ hành vi hiện có.
Không viết PoC riêng cho lỗ hổng "zero-attachment memory exhaustion" của `socket.io-parser` vì
bản vá không cần bump major/thay đổi hành vi API — chỉ patch nội bộ trong range semver đã khai báo,
rủi ro regression thấp, và advisory không cung cấp PoC tái tạo dễ áp dụng vào bộ test hiện tại.

## Summary output

- Branch: `fix/npm-audit-socketio-parser` (off `dev`)
- Thay đổi: `package-lock.json` only (`socket.io-parser` 4.2.6→4.2.7, `js-yaml` 3.15.0→3.15.1,
  `nanoid` 3.3.16→3.3.18)
- `npm audit`: 3 high-severity → 0 vulnerabilities
- `npm test`: 41/41 suites, 977/977 tests pass
- `TODO.md`/`docs/todo/B89-*.md` đánh dấu ✅ đã xong trong cùng lượt commit này.
