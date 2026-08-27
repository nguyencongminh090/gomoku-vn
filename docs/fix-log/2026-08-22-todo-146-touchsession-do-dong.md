# Fix log entry — 2026-08-22 21:12

## Prompt

Người dùng: "Do #146" (sau #145 đã merge vào `dev`).

## Action

`docs/instruction/B146-*.md` đặt điều kiện rõ: đo trước, đừng tin #81 (bench đó đo đường ĐỌC gộp
với ghi trong cùng một sample, không tách riêng chi phí ghi); nếu ghi cô lập vẫn là µs kể cả khi
tranh chấp thì **đóng như tradeoff đã đo**, đừng sửa cho có.

Mở rộng `server/scripts/bench-session-lookup.js` (append, không sửa phần cũ) với 2 phần mới:

1. **`touchSession()` cô lập** — cùng lưới `REALISTIC_TABLE_SIZES`/`REALISTIC_BURST_SIZES` của #81,
   không kèm `select.get()`. Kết quả: p50 5-6 µs, p99 dưới 20 µs — cùng bậc với lệnh đọc mà #81 đã đo.
2. **Dưới tranh chấp WAL thật** — mở connection thứ hai (`new Database(DB_FILE)` cùng file), giữ
   `BEGIN IMMEDIATE` chưa commit, rồi đo `touch.run()` trên connection chính. Kết quả: **20/20 lệnh
   block đúng ~5006 ms rồi ném `SQLITE_BUSY`** (busy_timeout mặc định better-sqlite3 = 5000 ms).

Con số thứ 2 **không** phải µs — đây là điểm khiến quyết định không đơn giản là "đóng ngay". Kiểm
tra: `grep -rn "new Database(" server/` ngoài `tests/`/`scripts/` chỉ ra **đúng 1 chỗ**
(`server/db/database.js:25`) — xác nhận kịch bản "connection thứ hai" **không reachable** trong kiến
trúc production hiện tại (comment đầu file: "Uses better-sqlite3 ... intentional for simplicity").

## Decision

Hai kết luận tách riêng theo đúng rule "call those out separately" của `CLAUDE.md`, vì phát hiện thứ
2 là một thứ khác với những gì #146 đặt ra ban đầu:

- **#146 — đóng, không sửa.** Dưới kịch bản **reachable** (mọi handshake thật hôm nay, không có
  tranh chấp), chi phí ghi cô lập là µs — đúng điều kiện đóng mà instruction đã đặt ra trước khi đo.
  Không sửa `verifySocketToken`/`touchSession`, không viết test (không có thay đổi code).
- **#149 (mới) — ghi lại làm địa lôi, không sửa, không cấp bách.** Số đo 5s-block/`SQLITE_BUSY` là
  thật nhưng kịch bản kích hoạt không tồn tại hôm nay. File riêng vì nó cảnh báo cho một thay đổi
  kiến trúc *khác* trong tương lai (ai đó thêm connection thứ hai), không phải một phần của quyết
  định #146.

**Không** thêm `busy_timeout` thấp hơn, retry logic, hay connection pool "để an toàn" cho #149 —
không có gì đang bị đe doạ để bảo vệ trong kiến trúc hiện tại, và mỗi lớp phòng thủ thêm vào cho một
kịch bản không dựng được là một chỗ có thể sai mà không ai test nổi.

## Summary output

`docs/todo/B146-*.md` cập nhật trạng thái ✅ Đã đo, ghi đầy đủ 2 bảng số đo + lý do đóng.
`docs/todo/B149-*.md` (mới) + `docs/instruction/B149-*.md` (mới) — cả hai file chi tiết mới đều nói
rõ "đừng viết test cho kịch bản không reachable". `TODO.md` #146 → ✅, thêm dòng index #149 mới.
`instruction.md` thêm dòng B149.

Không có thay đổi code sản xuất nào trong lượt này — chỉ mở rộng script bench (công cụ đo, không
phải code chạy trong request path) và tracking docs. `npm test` không cần chạy lại vì không có file
`server/`/`client/` nào thuộc runtime bị đổi; xác nhận bằng `git diff --stat` chỉ liệt kê
`server/scripts/bench-session-lookup.js` + các file `docs/`/`TODO.md`/`instruction.md`.

Không tạo nhánh `fix/*` — theo `git-workflow`, tracking-doc-only + script đo (không phải runtime code)
đi thẳng, không cần cô lập nhánh. Không đụng `server/db/gomoku.db` thật — bench tự tạo file DB tạm
trong `os.tmpdir()` và tự xoá khi thoát (`process.on('exit', ...)`), đã có sẵn từ #81, không đổi.
