# Phần B #87. `broadcastLiveMatchesUpdate` không throttle/diff — cascade N-broadcast khi huỷ giải đấu

**Nguồn:** yêu cầu người dùng "Check Broadcast, throttle in Tournament. Make sure it smooth"
(2026-08-09) — audit toàn bộ cơ chế broadcast/throttle trong hệ tournament qua CodeGraph.

## Đối chiếu với các broadcast khác trong hệ tournament (đã ổn, không cần sửa)

- `broadcastTournamentListUpdate` (`TournamentHandler.js:84-93`) — debounce thật 300ms
  (`LIST_DEBOUNCE_MS`) + diff (`_diffTournamentList`), chỉ gửi phần thay đổi.
- `_queueTournamentDetailUpdate`/`_queuePairingChanged` (`TournamentHandler.js`, xem #83) —
  batch theo `setImmediate` + diff, đã sửa ở #83.
- `broadcastTournamentDetail` gọi trực tiếp (không qua debounce) trên `tournament_started`/
  `completed`/`cancelled` — sự kiện 1 lần/giải, không có rủi ro dồn dập, không cần sửa.
- Các event trong ván (`tmatch:move`, timer, chat, draw/resign...) — 1 emit/1 hành động người
  dùng, không có tính toán tốn kém, tự nhiên bị giới hạn tần suất bởi tốc độ thao tác của người
  chơi thật. Không cần throttle.

## Vấn đề đã xác nhận — `broadcastLiveMatchesUpdate` (`server/socket/handlers/TournamentMatchHandler.js:326-328`)

```js
function broadcastLiveMatchesUpdate(io) {
  io.to(LIVE_MATCHES_ROOM).emit('live_matches:list', { matches: listLiveMatches(io) });
}
```

Đây là broadcast tournament DUY NHẤT không theo khuôn mẫu diff+coalesce đã dùng ở mọi nơi
khác trong hệ thống (kể cả `state.js`'s `broadcastLobbyUpdate`/`_emitRoomUpdate` cho phòng
thường):

1. **Không debounce/throttle** — gọi là emit ngay, không qua `setTimeout`/`setImmediate` nào.
2. **Không diff** — gửi lại toàn bộ danh sách live-matches mỗi lần, không tách
   upserts/removed như `_diffTournamentList`/`_diffTournamentEntries`/`_diffRoomUsers` đã làm.
3. **`listLiveMatches()` (dòng 300-323) không có trần trước khi tính toán** — lặp qua
   TOÀN BỘ `tournamentState.tournamentGameMap` (mọi ván tournament đang live, không chỉ của 1
   giải), với mỗi ván gọi `_getSpectators()` (quét toàn bộ socket trong room) để tính
   `spectatorCount`, RỒI MỚI sort + `.slice(0, MAX_LIVE_MATCHES=20)`. Chi phí mỗi lần gọi tỉ lệ
   với tổng số ván tournament đang diễn ra toàn hệ thống, không tỉ lệ với phần thực sự thay đổi.

**Trường hợp cascade cụ thể đã xác nhận qua code** — huỷ giải đấu
(`TournamentHandler.js:235-242`, `tournament_cancelled` listener):

```js
tournamentManager.on('tournament_cancelled', ({ tournamentId, cancelledLivePairingIds }) => {
  for (const pairingId of cancelledLivePairingIds) {
    getTournamentMatchHandler().forceCancelMatch(io, tournamentId, pairingId);
  }
  ...
});
```

`forceCancelMatch()` (`TournamentMatchHandler.js:480-493`) tự gọi `broadcastLiveMatchesUpdate(io)`
ở cuối. Vòng lặp trên gọi `forceCancelMatch` 1 lần/pairing đang live bị huỷ — huỷ 1 giải đấu có
N ván đang diễn ra đồng thời sẽ bắn **N lần tính toán đầy đủ + N lần emit toàn phòng
`LIVE_MATCHES_ROOM`** liên tiếp trong cùng 1 tick, thay vì 1 lần là đủ (chỉ trạng thái cuối cùng
mới có ý nghĩa với client).

Các lời gọi khác (`startMatch()` dòng 285, kết thúc ván dòng 460) mỗi lời gọi tương ứng đúng 1
sự kiện vòng đời ván thật (bắt đầu/kết thúc) — tần suất gọi ở đó không phải vấn đề, chỉ có N-cascade
khi huỷ giải mới là dồn dập thật sự.

## Việc cần làm

Xem hướng dẫn chi tiết: [docs/instruction/B87-live-matches-broadcast-khong-throttle-diff.md](../instruction/B87-live-matches-broadcast-khong-throttle-diff.md).

## Trạng thái

Chưa làm.
