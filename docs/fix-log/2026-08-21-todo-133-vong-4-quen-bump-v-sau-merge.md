# Fix log entry — 2026-08-21 19:23

## Prompt

Sau khi merge `fix/mobile-board-grid-and-size` vào `dev` (giữ nguyên `?v=133` vì nhánh fix chỉ ở
`?v=126`, thấp hơn `dev`), người dùng báo lại live site (`play3cr.dpdns.org`) vẫn thấy bàn cờ cũ.
Điều tra: server thật đang chạy đúng commit trước merge (`e117e57`, byte-for-byte khớp
`js/board.js?v=133` live) — chưa `git pull`/restart, không phải lỗi code. Người dùng hỏi lại "v?=
should be 134?" sau khi nghe giải thích.

## Action

Đúng — đây là bug thật, không chỉvấn đề deploy. Quy tắc merge trong `git-workflow` skill nói rõ:
"?v=N conflicts: keep dev's side per file, **re-bump the whole repo to max(dev, main) + 1**" — bước
"+1" đã bị bỏ sót lúc merge trước (chỉ giữ nguyên 133 vì nghĩ "126 < 133 nên không cần bump"). Sai:
`board.js`/`room-zen.css` **đổi nội dung thật** trong lúc merge (từ code cũ sang code có fix), nhưng
URL vẫn `?v=133` — đúng chính xác cache-bust bug mà quy tắc `?v=N` trong `CLAUDE.md` tồn tại để
ngăn: bất kỳ client nào đã cache `js/board.js?v=133` **trước** merge sẽ giữ mãi bản cũ vì URL không
đổi.

Bump `?v=133 → 134` toàn bộ `client/*.html` + `client/js/*.js` (trừ 2 mockup đóng băng).

## Decision

Không chỉ bump 1 file (`board.js`) — theo đúng `CLAUDE.md`'s cache-busting rule, mọi file HTML/JS
cùng chia sẻ 1 giá trị `?v=N`, kể cả file không đổi nội dung lần này (tránh tình trạng nhiều giá trị
khác nhau cùng lúc, đã từng gây bug module-duplicate trước đây).

## Summary output

`npm test` 1193/1193. `?v=` verify: `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup`
ra đúng 1 giá trị (134). Cần đẩy lên cả `dev` và `main` (theo đúng thứ tự người dùng đã chọn ở vòng
merge trước: dev trước, main sau) rồi user tự pull/restart server thật.

**Bài học ghi lại**: khi merge có conflict thật ở file `?v=N` do nội dung thay đổi (không chỉ do số
khác nhau), luôn `+1` sau khi lấy `max(dev, main)` — không được giả định "số hiện tại đã đủ cao nên
bỏ qua bước +1".

[chi tiết TODO](../todo/B133-mobile-grid-line-nhat-va-ban-co-nho.md)
