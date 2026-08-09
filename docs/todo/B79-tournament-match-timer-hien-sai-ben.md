# Phần B #79. Đồng hồ trận đấu giải đấu đôi khi hiện sai bên (tên/thời gian gắn nhầm panel)

**Nguồn:** báo cáo người dùng — "Time sometimes run on wrong sides" (2026-08-09).

## Vấn đề đã xác nhận (đọc code qua CodeGraph, không suy đoán)

Đồng hồ được server tính đúng (`TimerManager`) và client chỉ hiển thị lại
(không tự đếm thật) — mô hình server-authoritative này đúng như thiết kế.
Bug nằm ở **client gắn nhầm panel "đen"/"trắng" với đúng người chơi**, do
`renderHeader()` (`client/js/tournament-match.js:381-382`) gán tên panel theo
**vị trí mảng** `gameState.players[0]`/`players[1]` (thứ tự "seat") một cách
cố định:

```js
document.getElementById('clock-black-name').textContent = p1 ? p1.displayName : '—';
document.getElementById('clock-white-name').textContent = p2 ? p2.displayName : '—';
```

nhưng ai thực sự cầm quân Đen/Trắng lại được quyết định **động**, theo 2 cơ
chế độc lập không khớp với thứ tự seat cố định đó:

**Bug 1 — Luật Swap2 (xảy ra ngay trong 1 ván, không cần series nhiều ván):**
`GameEngine._assignColors(firstColor, secondColor)` (`server/managers/GameEngine.js:375-378`)
set `players[0].color = firstColor`. Khi P2 chọn "black" (hoặc P1 chọn
"white") trong bước lựa chọn Swap2 (`swap2Choice()`, dòng 338-341/357-361),
kết quả là `players[0].color = 'WHITE'` — seat đầu tiên cầm Trắng. Nhưng
client vẫn luôn gán `clock-black-name` = `players[0]`, nên panel có chấm màu
đen lại hiện tên người đang cầm Trắng.

**Bug 2 — Series nhiều ván (từ ván thứ 2 trở đi, gameIndex lẻ):**
`startMatch()` (`server/socket/handlers/TournamentMatchHandler.js:218-220`)
cố ý đảo thứ tự seat mỗi ván (`gameIndex % 2`) để màu quân xoay vòng trong
series. Nhưng `TimerManager` (`server/managers/tournament/PairingLifecycle.js:287-288`)
gán `blackPlayerId`/`whitePlayerId` **cố định** theo `player1EntryId`/
`player2EntryId` suốt cả series, không xoay theo. Từ ván 2 (gameIndex lẻ) trở
đi: tên panel (theo seat, đã đảo) không còn khớp với giá trị thời gian
(`timerValues.black`/`.white`, theo entryId cố định) — panel hiện đúng thời
gian của người này nhưng dưới tên người kia.

Reconnect (`resyncOnConnect`/`tmatch:subscribe`) **không phải nguyên nhân
độc lập** — chỉ gửi lại đúng state đã sai sẵn, không tạo thêm lỗi mới.

## Việc cần làm

Xem hướng dẫn chi tiết: [docs/instruction/B79-tournament-match-timer-hien-sai-ben.md](../instruction/B79-tournament-match-timer-hien-sai-ben.md).

## Trạng thái

✅ ĐÃ XONG.

Sửa `renderHeader()` (`client/js/tournament-match.js`) để tra `clock-black-name`/
`clock-white-name` theo `gameState.players[].color` thay vì theo vị trí mảng
`players[0]`/`[1]` — đúng như hướng dẫn tại
[docs/instruction/B79-tournament-match-timer-hien-sai-ben.md](../instruction/B79-tournament-match-timer-hien-sai-ben.md).
`matchTitleEl`/`slot1NameEl`/`slot2NameEl` giữ nguyên theo seat `p1`/`p2` (không có
chấm màu, không cần sửa). Bump cache-bust `?v=89 → ?v=90`.

Verify bằng server thật + Playwright (throwaway db, theo đúng quy trình an toàn
DB), test riêng cả 2 kịch bản độc lập:
- Swap2: P2 chọn "black" → `players[0]` cầm WHITE — cả 2 trình duyệt hiện đúng
  `clock-black-name`/`clock-white-name` theo màu thực tế.
- Series xoay vòng: ván 2 (gameIndex lẻ) sau khi ván 1 kết thúc bằng resign — tên
  panel và giá trị thời gian bên cạnh vẫn khớp đúng người chơi.

0 console error / page error / HTTP 4xx-5xx ở cả 2 kịch bản. `npm test`: 948/948
pass (không đổi, đây là fix client-only). Chi tiết đầy đủ:
[docs/fix-log/2026-08-09-todo-79-tournament-match-timer-wrong-side.md](../fix-log/2026-08-09-todo-79-tournament-match-timer-wrong-side.md).
