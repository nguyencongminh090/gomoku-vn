# Báo cáo điều tra: Độ trễ khi di chuyển trong Tournament (navigate/come in/out)

Ngày: 2026-08-09

## 1. Phạm vi đã kiểm tra

Đã dùng CodeGraph để lần theo toàn bộ đường đi: `client/js/tournament-detail.js` → socket events → `server/socket/handlers/TournamentHandler.js` / `TournamentMatchHandler.js` → `server/managers/tournament/TournamentManager.js` → `server/db/database.js` (SQLite/better-sqlite3), cộng với REST route `server/routes/tournamentGames.js`.

## 2. Kết luận nhanh

**Database KHÔNG phải là nguyên nhân chính.** Các bảng tournament đều đã có index đầy đủ:

```
idx_tournament_players_tournament_id, idx_tournament_pairings_tournament_id,
idx_tournament_pairings_state, idx_tournament_games_tournament_id,
idx_tournament_games_pairing_id, ...
```

Vấn đề nằm ở **cách client điều hướng (full page reload) + số round-trip thừa + một số điểm ghi DB đồng bộ (blocking) trên đường dẫn nóng**. Chi tiết bên dưới, xếp theo mức độ nghi ngờ giảm dần.

---

## 3. Các điểm nghi ngờ gây độ trễ (xếp theo ưu tiên)

### 3.1. `goToMatch()` dùng full page navigation, không phải SPA (nghi ngờ cao nhất)

`client/js/tournament-detail.js:365`:
```js
function goToMatch(pairingId) {
  window.location.href = `tournament-match.html?...`;
}
```
Mỗi lần bấm "vào trận" (enter) là **tải lại toàn bộ trang** → đóng socket cũ, mở socket mới → chạy lại toàn bộ handshake xác thực.

Handshake này **không rẻ**: `verifySocketToken` đọc session từ SQLite **đồng bộ** (better-sqlite3 = blocking). Chính repo đã có script đo việc này (`server/scripts/bench-session-lookup.js`) với comment gốc:

> "better-sqlite3 is synchronous — so every lookup blocks the event loop for its duration... that burst is exactly where a per-connection blocking read would show up."

Tức là: nếu tại thời điểm user bấm "enter"/back, server đang có nhiều connection khác (nhiều người xem cùng lúc giải đấu), **event loop bị chặn tuần tự bởi từng session lookup** → mọi request khác (kể cả của chính user đó) phải chờ. Đây là nguyên nhân hợp lý nhất cho triệu chứng "thỉnh thoảng chậm" — nó phụ thuộc tải tức thời, không phải lúc nào cũng chậm.

Sau khi socket mới connect, `resyncOnConnect()` (TournamentMatchHandler.js:338) còn phải **duyệt toàn bộ `tournamentState.tournamentGameMap`** (tất cả trận đang live toàn server) để tìm trận của user đó — O(n) theo số trận đang diễn ra toàn hệ thống, chạy trên mỗi lần connect.

### 3.2. Round-trip thừa khi đăng ký/hủy đăng ký (come in/out)

`client/js/tournament-detail.js:163-164`:
```js
client.on('tournament:registered', () => client.emit('tournament:get', { tournamentId }));
client.on('tournament:unregistered', () => client.emit('tournament:get', { tournamentId }));
```

Nhưng server (`TournamentHandler.js:271-310`) **đã tự broadcast** `broadcastTournamentDetail(io, result.tournament)` ngay sau khi register/unregister thành công — payload đó đã đầy đủ dữ liệu tournament mới nhất, gửi tới đúng room.

→ Client vẫn chủ động bắn thêm 1 `tournament:get` **round-trip thừa hoàn toàn**, khiến UI phải chờ thêm 1 chuyến đi-về mạng nữa mới "ổn định" sau khi bấm join/leave, dù dữ liệu cần thiết đã tới trước đó qua `tournament:updated`. Trên latency mạng cao (điện thoại, 3G/4G, hoặc qua Cloudflare Tunnel), khoản round-trip thừa này cộng dồn cảm giác "lag".

### 3.3. Mỗi lần register/unregister bắn **2 broadcast toàn phòng**, không debounce

Cùng một hành động (`tournament:register`) trigger:
```js
broadcastTournamentDetail(io, result.tournament);   // gửi cho room tournament:<id>
broadcastTournamentListUpdate(io);                  // gửi cho TOÀN BỘ lobby room
```
Không có debounce như cơ chế `_queuePairingChanged` (dùng `setImmediate` gom nhiều thay đổi pairing lại). Nếu nhiều người join/leave gần như đồng thời (trước giờ khai mạc), server sinh ra loạt broadcast full-payload liên tiếp tới cả 2 room — tăng tải serialize + gửi mạng đúng lúc nhiều client đang cố load trang.

### 3.4. `getTournamentGames` không phân trang, `loadGamesHistory` render đồng bộ

`server/db/database.js:715`:
```sql
SELECT ... FROM tournament_games WHERE tournament_id = ? ORDER BY started_at ASC
```
Không có `LIMIT`. Với giải đấu chạy lâu / nhiều vòng / seriesMode nhiều ván, số dòng trả về tăng không giới hạn.

Client (`tournament-detail.js:907-955`) fetch REST riêng (`/api/tournaments/:id/games`), rồi dựng **toàn bộ bảng HTML bằng chuỗi `innerHTML`** trong 1 lần đồng bộ — với giải đấu có hàng trăm ván, đây là một điểm giật UI khi user chuyển sang tab "Games", đặc biệt trên máy yếu/điện thoại.

### 3.5. `savePairing()` ghi đồng bộ, blob JSON tăng dần theo trận

`server/db/database.js:605-636`: mỗi lần trạng thái pairing đổi (report time, confirm, ready, mỗi nước đi được lưu vào `moves`, kết thúc ván...) đều `db.prepare(...).run(...)` **đồng bộ**, trong đó `games`/`moves` được `JSON.stringify` lại **toàn bộ mảng** mỗi lần (không phải append) — càng về cuối trận, blob càng lớn, thời gian stringify + ghi WAL càng tăng. Vì better-sqlite3 đồng bộ, việc này **chặn event loop** của toàn server trong lúc ghi, ảnh hưởng luôn tới các socket khác đang thao tác navigate/join cùng thời điểm.

### 3.6. `_diffTournamentEntries` — JSON.stringify từng entry mỗi broadcast

`TournamentHandler.js:107-125`: mỗi lần `broadcastTournamentDetail` chạy, code `JSON.stringify` **từng entry một** để so sánh diff. Với giải đấu ít người thì không đáng kể, nhưng đây là chi phí O(n) lặp lại trên **mỗi** lần có ai đó register/unregister — cộng dồn với 3.3 (không debounce) sẽ nhân lên khi có burst đăng ký.

---

## 4. Điều KHÔNG phải nguyên nhân (đã loại trừ)

- **Index DB**: đầy đủ cho mọi truy vấn tournament (register, get pairings, get games).
- **Cấu trúc pairing patch (`_queuePairingChanged`)**: đã có batching qua `setImmediate` — thiết kế tốt, không phải điểm nghẽn.
- **`listTournaments()` / lobby**: thuần in-memory Map, không chạm DB.

---

## 5. Khuyến nghị hướng xử lý (để quyết định, chưa triển khai)

| # | Vấn đề | Hướng sửa gợi ý | Độ ưu tiên |
|---|---|---|---|
| 1 | Full page reload khi vào trận (3.1) | Cân nhắc giữ nguyên socket, chuyển sang điều hướng kiểu SPA/emit thay vì `window.location.href`, hoặc tối thiểu đo lại session-lookup latency thực tế dưới tải hiện tại (script đã có sẵn) | Cao |
| 2 | Round-trip `tournament:get` thừa (3.2) | Bỏ 2 dòng listener thừa ở tournament-detail.js:163-164, dựa hẳn vào `tournament:updated` đã nhận | Cao — sửa rẻ, lợi ích rõ |
| 3 | Không debounce broadcast register/unregister (3.3) | Áp dụng cơ chế debounce giống `_queuePairingChanged` cho `broadcastTournamentDetail`/`broadcastTournamentListUpdate` | Trung bình |
| 4 | Games history không phân trang (3.4) | Thêm `LIMIT`/phân trang cho `getTournamentGames`, hoặc lazy-render bảng | Trung bình (tăng dần theo tuổi giải đấu) |
| 5 | Ghi `savePairing` đồng bộ + blob JSON tăng dần (3.5) | Cần đo thực tế (kích thước blob trung bình, tần suất ghi) trước khi quyết định — có thể chưa đáng lo ở quy mô hiện tại | Thấp/cần đo trước |

**Việc cần làm trước khi sửa bất cứ gì**: theo đúng nguyên tắc "Root-cause diagnosis" của repo — nên **đo thực tế** (ví dụ thêm timestamp log quanh session lookup lúc handshake, và quanh `savePairing`) trong lúc tái hiện được hiện tượng "thỉnh thoảng chậm", vì đây là loại lỗi phụ thuộc tải tức thời (giống tiền lệ IP quota 6 vòng sửa sai lớp — TODO.md #74/§44) — rất dễ sửa nhầm lớp nếu chỉ đoán.

---

## 6. Đề xuất bước tiếp theo

Ghi việc này vào `TODO.md`/`instruction.md` theo quy tắc "stack, don't perform directly" — tách thành các mục riêng theo bảng ở mục 5 (mỗi mục 1 fix/1 branch), thay vì gộp sửa chung, để không lẫn nhiều thay đổi không liên quan vào 1 commit.

---

## 7. Kết quả xử lý thực tế (TODO.md #81-#85, cập nhật 2026-08-09)

Cả 5 mục đã đóng. Số đo thực tế **đảo ngược thứ hạng ưu tiên ban đầu** ở mục 5 —
2 mục dự đoán "Cao" (3.1) và "Thấp/cần đo" (3.5) đều hoá ra không phải bottleneck,
trong khi 3 mục còn lại (round-trip thừa, thiếu debounce, thiếu phân trang) đúng
như dự đoán và đã sửa.

| Mục | Dự đoán ban đầu | Kết quả đo/sửa thực tế | Trạng thái |
|---|---|---|---|
| 3.1 (goToMatch full reload) | Cao — nghi ngờ cao nhất | Đo bằng `bench-session-lookup.js` mở rộng ở quy mô thực tế (burst 8-64, table 20-500 dòng): p50 ~5.6-5.9µs, p99 tối đa 46.1µs, tệ nhất "total" 0.4ms cho burst 64 — quá nhỏ so với ngưỡng 5ms coi là đáng lo. **Không phải bottleneck**, không sửa. | Đóng — #81 |
| 3.2 (round-trip `tournament:get` thừa) | Cao — sửa rẻ, lợi ích rõ | Xoá 2 dòng listener thừa ở `tournament-detail.js:163-164`. | ✅ Đã sửa — #82 |
| 3.3 + 3.6 (broadcast không debounce + diff O(n)) | Trung bình | Thêm `_queueTournamentDetailUpdate()` (gộp theo `setImmediate`, cùng khuôn mẫu `_queuePairingChanged`). | ✅ Đã sửa — #83 |
| 3.4 (games history không phân trang) | Trung bình | Thêm `page`/`limit`/`pagination` cho `getTournamentGames()` + route + UI phân trang, theo khuôn mẫu `routes/games.js`. | ✅ Đã sửa — #84 |
| 3.5 (`savePairing` đồng bộ + blob JSON) | Thấp/cần đo trước | Benchmark với shape dữ liệu thật (`{x,y,color,timestamp}`, board tối đa 20×20=400 nước, series tối đa 99 ván): stringify+write luôn dưới 0.3ms kể cả worst-case. **Không phải bottleneck**, không sửa. Phát hiện phụ: 1 lần ghi bị chặn ~138ms do WAL auto-checkpoint (~4MB) — không liên quan tới kích thước blob của `savePairing`, thuộc phạm vi khác (cấu hình WAL toàn db) nếu muốn xử lý sau này. | Đóng — #85 |

**Rút ra:** đúng như nguyên tắc "Root-cause diagnosis"/"đo trước khi sửa" của repo
— dự đoán dựa trên đọc code (dù có lý) đã xếp sai thứ hạng 2/5 mục so với số đo
thật. Độ trễ "navigate/comein/out" báo cáo gốc mô tả, nếu vẫn còn tái diễn sau
khi #82-#84 lên production, nhiều khả năng đến từ lớp khác chưa được xét ở đây
(mạng/CDN/Cloudflare Tunnel, hoặc phía client ngoài phạm vi các điểm đã kiểm) —
cần báo cáo lại kèm thời điểm cụ thể để điều tra tiếp nếu còn xảy ra.
