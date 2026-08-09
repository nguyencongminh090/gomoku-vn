# B83 — Debounce broadcast register/unregister giống cơ chế `_queuePairingChanged` (hướng dẫn thực thi)

Nguồn: báo cáo người dùng, TODO.md #83 (2026-08-09).

## Bối cảnh kỹ thuật

`server/socket/handlers/TournamentHandler.js` đã có sẵn 1 khuôn mẫu debounce
đúng đắn cho pairing changes (`_queuePairingChanged`, dòng 152-175): gom
nhiều thay đổi vào 1 `Map`, dùng `setImmediate` để flush 1 lần thay vì
broadcast ngay mỗi lần. `tournament:register`/`unregister` (dòng 271-310)
KHÔNG dùng cơ chế tương tự — mỗi thao tác bắn ngay
`broadcastTournamentDetail` + `broadcastTournamentListUpdate`.

`_diffTournamentEntries()` (dòng 107-125) cũng `JSON.stringify` từng entry
một mỗi lần gọi — chi phí này tự nhiên giảm nếu debounce gộp được nhiều thay
đổi thành ít lần gọi hơn.

## Cách làm

Áp dụng cùng khuôn mẫu `setImmediate`-batch cho `broadcastTournamentDetail`
theo `tournamentId`: thay vì gọi trực tiếp trong handler
`tournament:register`/`unregister`, gọi 1 hàm `_queueTournamentDetailUpdate(io, tournament)`
mới — giữ 1 `Map<tournamentId, tournament>` pending + 1 `Map<tournamentId, Immediate>`,
flush bằng `setImmediate` giống `_queuePairingChanged`. `broadcastTournamentListUpdate(io)`
(đã tồn tại — kiểm tra xem có đang tự debounce theo `setImmediate`/`setTimeout`
nào không trước khi thêm lớp debounce chồng lên; nếu chưa có, áp dụng cùng
khuôn mẫu debounce riêng theo phạm vi toàn cục, không theo tournamentId, vì
nó gửi cho `TOURNAMENT_LIST_ROOM` chung).

## Bẫy cụ thể

- Giữ nguyên `broadcastTournamentDetail(io, tournament)` được gọi trực tiếp
  (không qua debounce) ở các nơi khác đã có sẵn (`tournament_started`,
  `tournament_completed`, `tournament_cancelled` trong `init()`, dòng
  184-210) — những sự kiện đó vốn đã hiếm khi bắn dồn dập (không phải do
  nhiều user thao tác đồng thời như register/unregister), debounce ở đó
  không cần thiết và có thể làm chậm phản hồi tự nhiên cho các mốc quan
  trọng (giải bắt đầu/kết thúc/hủy).
- `setImmediate` gộp trong cùng 1 tick event loop — nếu 2 người
  register/unregister cách nhau vài chục ms (không phải cùng 1 tick), vẫn
  sẽ có 2 broadcast riêng, đây là hành vi đúng như thiết kế
  `_queuePairingChanged` hiện có, không cần gộp mạnh hơn (ví dụ dùng
  `setTimeout` với delay dài hơn) — tránh làm UI cảm giác "chậm cập nhật"
  khi chỉ có 1 người thao tác đơn lẻ (trường hợp phổ biến nhất).
- Test cả 2 kịch bản riêng: (a) 1 người đăng ký đơn lẻ — vẫn phải cập nhật
  UI gần như tức thời (không có cảm giác trễ do debounce), (b) nhiều người
  đăng ký gần như đồng thời — chỉ 1 broadcast gộp thay vì N broadcast riêng.

## Không thuộc phạm vi (đừng gộp vào fix này)

- Không đổi round-trip `tournament:get` thừa ở client (đó là #82, mục
  riêng) — 2 fix độc lập, làm cả 2 mới giải quyết trọn vẹn độ trễ khi
  come in/out.
- Không đổi `_diffTournamentEntries` sang thuật toán diff khác (ví dụ so
  sánh field-by-field thay vì `JSON.stringify` toàn object) — chưa có bằng
  chứng đây là bottleneck riêng biệt ngoài việc nó lặp lại theo tần suất
  broadcast; debounce đã tự nhiên giảm số lần chạy, đủ cho mục này.
