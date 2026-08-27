# Fix log entry — 2026-08-27 06:05

## Prompt

(Tiếp nối #157 — không phải prompt mới của người dùng) Merge `fix/viewer-list-presence-indicator`
vào `main` xong (PR #20), theo quy tắc `git-workflow` "một `fix/*` merge vào `main` phải cũng lên
`dev` trong cùng phiên".

## Action

`git checkout dev && git merge main` — xung đột ở `TODO.md`/`instruction.md`/`docs/fix-log.md`
(chèn cùng vị trí khác nội dung, dev có thêm #135-#156/#158 mà nhánh fix's base `main` không có) và
toàn bộ file `client/*.html`/`client/js/*-entry.js` (thuần số `?v=N`: `main` ở 139, `dev` ở 155).

Giải quyết theo đúng rule "max(dev, main) + 1, luôn tính lại, không suy diễn từ số bên nào đã lớn
hơn": giữ `?v=` phía `dev` (`git checkout --ours`) cho toàn bộ file xung đột thuần version, rồi
bump lại **toàn repo** thành `156` (`155→156`, không phải `139`). `TODO.md`/`instruction.md`/
`docs/fix-log.md` giữ cả 2 phía (nội dung #135-#158 của `dev` + entry #157 mới của `main`), sắp
theo đúng vị trí trong Phần B.

## Decision

- Không giữ nguyên `?v=139` chỉ vì đó là số nhánh fix mang theo — `dev` đã ở `155`, giữ 139 sẽ tái
  lặp đúng bug cache-bust mà tiền lệ 2026-08-21 (#133 vòng 4) đã dạy.
- Không sửa lại nội dung `docs/fix-log/2026-08-27-todo-157-viewer-list-presence-dot.md` (đã ghi
  `?v=138→139`) — đúng là những gì đã xảy ra trên `main`; fix-log append-only, sự kiện re-bump khi
  merge dev là một entry MỚI (file này), không phải sửa lại lịch sử.

## Summary output

`npm test` 1151/1151 sau merge (không tests mới, chỉ hợp nhất). `?v=` toàn repo `156`, xác nhận
bằng `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup | grep -oP '\?v=\d+' | sort -u`
ra đúng 1 giá trị. `dev` giờ có cả #157 (đã sửa) lẫn #158 (đang chờ, filed cùng ngày).
