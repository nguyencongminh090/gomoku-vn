# B87 — Coalesce + diff `broadcastLiveMatchesUpdate` (hướng dẫn thực thi)

Nguồn: yêu cầu người dùng audit broadcast/throttle tournament, TODO.md #87 (2026-08-09).

## Bối cảnh kỹ thuật

`TournamentMatchHandler.js` chưa có cơ chế debounce/queue nào riêng (khác
`TournamentHandler.js`, nơi `_queuePairingChanged`/`_queueTournamentDetailUpdate`
đã có sẵn khuôn mẫu `setImmediate`-batch, xem #83). Cần dựng 1 cơ chế tương tự
cho `broadcastLiveMatchesUpdate`, cộng thêm phần diff mà các broadcast khác
(`_diffTournamentList`, `_diffRoomUsers`...) đều có nhưng broadcast này thì chưa.

## Cách làm

Áp dụng đúng 2 lớp đã có sẵn làm khuôn mẫu trong chính codebase này, không cần
phát minh cơ chế mới:

1. **Coalesce lời gọi trong cùng 1 tick** — copy khuôn mẫu `setImmediate`-batch
   của `_queuePairingChanged` (`TournamentHandler.js:184-207`): 1 biến cờ
   `_liveMatchesUpdatePending` (hoặc `Immediate` handle) theo `io` (dùng
   `WeakMap<io, Immediate>` giống `_listUpdateTimers` nếu cần nhiều `io` instance,
   nhưng thực tế server này chỉ có 1 `io` — 1 biến module-level đơn giản như
   `_liveMatchesUpdateTimer` là đủ, không cần `Map`/`WeakMap` theo tournamentId
   vì đây là 1 danh sách toàn cục, không theo từng giải). Khi
   `broadcastLiveMatchesUpdate(io)` được gọi mà đã có 1 lần flush đang chờ, chỉ
   return ngay (giống `_queuePairingChanged` dòng 195: `if (...Timers.has(...)) return`).
2. **Diff trước khi emit** — thêm 1 hàm `_diffLiveMatches(list)` theo đúng khuôn
   mẫu `_diffTournamentList`/`_diffRoomUsers`: giữ 1 snapshot
   `Map<pairingId, serialized-JSON>` của lần emit trước, so sánh, chỉ emit
   `upserts`/`removed` (đổi tên event nếu cần, ví dụ `live_matches:list_patch`,
   hoặc giữ nguyên `live_matches:list` nhưng đổi shape payload — **kiểm tra
   client `client/js/*.js` đang lắng nghe `live_matches:list` với shape nào
   trước khi đổi event name/shape, cập nhật client cùng lúc nếu đổi**).
   `spectatorCount` đổi liên tục (mỗi lần 1 khán giả vào/ra) — cân nhắc: nếu diff
   theo toàn bộ object serialize (kể cả `spectatorCount`), mỗi lần đổi khán giả
   cũng tính là "thay đổi" và vẫn emit; đây là hành vi chấp nhận được (đúng ý
   nghĩa, không phải bug), không cần tách `spectatorCount` ra khỏi diff.

## Bẫy cụ thể

- **`listLiveMatches()` (dòng 300-323) tính TOÀN BỘ `tournamentGameMap` trước khi
  `.slice(0, MAX_LIVE_MATCHES)`** — việc coalesce/diff ở tầng broadcast không tự
  động sửa chi phí O(tổng số ván live) mỗi lần *thực sự* flush. Nếu muốn giảm chi
  phí này thêm (không bắt buộc cho #87, có thể tách việc riêng nếu cần), phải sort
  trước rồi giới hạn tính `_getSpectators()` chỉ cho 20 ván sẽ hiển thị — KHÔNG tính
  spectator cho ván sẽ bị `.slice()` bỏ đi. Đổi thứ tự sort/slice/tính-spectator cần
  cẩn thận vì `sort()` hiện tại dựa trên `startedAt` đã có sẵn trong `match` (không
  cần spectator để sort) — tách được, nhưng đây là optimization riêng, không bắt
  buộc phải làm trong cùng fix #87 nếu chỉ cần "smooth" ở tầng broadcast-storm.
- **Vòng lặp huỷ giải đấu (`TournamentHandler.js:236-238`, `forceCancelMatch` mỗi
  pairing) là nơi thực sự cần coalesce phát huy tác dụng** — verify bằng cách huỷ
  1 giải có ≥3 ván đang live cùng lúc (dựng qua socket thật, không giả lập), đếm số
  lần client nhận `live_matches:list`/`_patch` — phải còn ĐÚNG 1 lần (không phải N),
  không phải chỉ đọc code suy luận.
- **Không đụng `startMatch()` (dòng 285) hay kết thúc ván (dòng 460)** — 2 chỗ này
  gọi `broadcastLiveMatchesUpdate` đúng 1 lần/sự kiện vòng đời thật, coalesce ở đây
  không có gì để gộp (không dồn dập), chỉ cần đảm bảo thêm lớp `setImmediate` không
  làm chậm cảm nhận UI khi chỉ có 1 ván bắt đầu/kết thúc đơn lẻ (test case (a) như
  #83 đã làm — 1 sự kiện đơn lẻ vẫn phải cập nhật gần như tức thời).
- **Test cả 2 kịch bản** (giống #83): (a) 1 ván bắt đầu/kết thúc đơn lẻ — vẫn cập
  nhật gần tức thời; (b) huỷ giải có nhiều ván live cùng lúc — chỉ 1 broadcast gộp.
- `MAX_LIVE_MATCHES = 20` — không đổi giá trị cap này, không nằm trong phạm vi #87.

## Không thuộc phạm vi (đừng gộp vào fix này)

- Không đổi cơ chế debounce 300ms kiểu `LIST_DEBOUNCE_MS` cho broadcast này — đây
  là danh sách "đang live ngay bây giờ" (khác tournament list là danh sách các giải),
  nên ưu tiên coalesce theo tick (`setImmediate`, phản hồi gần tức thời) giống
  `_queuePairingChanged`, không phải debounce có độ trễ cố định như list giải đấu.
  Nếu đo thực tế thấy `setImmediate` không đủ gộp (ví dụ nhiều giải bị huỷ đồng
  thời từ nhiều thao tác admin cách nhau vài chục ms), quay lại bàn thêm — đừng tự
  đổi sang `setTimeout` dài hơn khi chưa đo.
- Không tối ưu O(tổng số ván live) trong `listLiveMatches()`/`_getSpectators()`
  trừ khi đo được đây thực sự là bottleneck ở quy mô thật (xem rule "Root-cause
  diagnosis" và "Security findings: verify... đo trước khi sửa" trong `CLAUDE.md`)
  — phần "Bẫy cụ thể" ở trên đã ghi rõ hướng tối ưu nếu sau này cần, nhưng #87 chỉ
  yêu cầu hết N-broadcast-cascade + thêm diff, không bắt buộc tối ưu độ phức tạp
  thuật toán trong cùng lần này.
