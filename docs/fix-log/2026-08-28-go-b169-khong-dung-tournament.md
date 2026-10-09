# Fix log entry — 2026-08-28 16:30

## Prompt

"Remove B169, do not touch tournament for now."

## Action

B169 (`tournament-match.js` dùng chung `timer-sync-core.js`) được stack ở
commit `a379de1` trong lúc làm #168 Bước 1 — sau khi tách `timer-sync-core.js`,
`tournament-match.js` là bản sao hand-written **duy nhất còn lại** của maths
đồng hồ, và `applyTimerSync()` của nó vẫn đọc `Date.now()` 2 lần (nhánh dự
phòng ra `-1` thay vì `0`, 1ms skew ảo). Task đó chờ 1 câu trả lời của người
dùng (chỉ sửa offset, hay mang cả cơ chế đo half-RTT sang).

Người dùng chốt: gỡ B169, chưa đụng tournament.

- Xoá `docs/todo/B169-*.md` + `docs/instruction/B169-*.md`.
- Xoá dòng index B169 ở `TODO.md` + `instruction.md`; bỏ đoạn "Tách [B169]" khỏi
  dòng index #168.
- `docs/todo/B168-*.md` §"Ngoài phạm vi" và `.claude/rules/diagnostic-page-sync.md`
  §"Not covered here": ghi lại đúng sự thật kỹ thuật (bản sao đồng hồ duy nhất
  còn lại + lỗi `Date.now()` 2 lần) nhưng **không có task** — chỉ là mục "biết,
  cố ý hoãn" theo quyết định người dùng. Nếu về sau đụng đồng hồ tournament vì
  lý do khác, đó là lúc route nó qua `timer-sync-core.js`.
- **Không đụng** `client/js/tournament-match.js` / `client/tournament-match.html`
  (đúng yêu cầu). Không đổi code, không bump `?v=`.
- Commit `a379de1` giữ nguyên message "stack B169" — sổ lịch sử, không rebase.
- Dòng fix-log Bước 8 (16:05) và file chi tiết #168 nhắc "B169 đã stack" — giữ
  nguyên (append-only); đúng với thời điểm 16:05. Dòng này là bản đính chính.

## Decision

- Lỗi `Date.now()` 2 lần ở `tournament-match.js` là thật nhưng nhỏ (1ms, chỉ ở
  nhánh dự phòng khi `timer:sync` thiếu `serverTime`) và không ai báo cáo triệu
  chứng — chấp nhận để nguyên.
- Thông tin kỹ thuật không bị xoá hẳn (vẫn ở B168 "Ngoài phạm vi" + sync rule),
  chỉ hạ khỏi trạng thái "task đang chờ" xuống "biết, hoãn". Ai revisit thì tạo
  mục mới.

## Summary output

Gỡ B169 khỏi tracking (4 file: 2 xoá, 2 sửa index) + 2 doc ghi lại dạng
"known-deferred". `tournament-match.js` không đụng. Không đổi code, `npm test`
không chạy lại (doc-only). `feature/diag-latency-page`.
