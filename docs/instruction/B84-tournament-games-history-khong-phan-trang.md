# B84 — Phân trang "Lịch sử ván đấu" giải đấu (hướng dẫn thực thi)

Nguồn: báo cáo người dùng, TODO.md #84 (2026-08-09).

## Bối cảnh kỹ thuật

`getTournamentGames()` (`server/db/database.js:715-724`) trả về toàn bộ
`tournament_games` của 1 giải đấu, không `LIMIT`. `loadGamesHistory()`
(`client/js/tournament-detail.js:907-918`) fetch 1 lần rồi
`renderGamesHistory()` (dòng 920-955) dựng cả bảng bằng `innerHTML` đồng bộ.
Route: `GET /api/tournaments/:tournamentId/games`
(`server/routes/tournamentGames.js:29-36`).

## Cách làm

Tham khảo khuôn mẫu phân trang đã có sẵn ở `routes/games.js`
(`GET /api/games`, dòng 57-79): `page`/`limit` (cap `limit` ở mức hợp lý,
`routes/games.js` dùng `Math.min(50, ...)`), `offset`, trả thêm object
`pagination` (`page`, `limit`, `total`, `totalPages`).

1. **Server**: thêm hàm `getTournamentGameCount(tournamentId)` +
   `LIMIT ?/OFFSET ?` vào `getTournamentGames()`, hoặc thêm tham số mới giữ
   nguyên tên hàm cũ (kiểm tra `getTournamentGames` chỉ có 1 caller — route
   này — nên đổi chữ ký hàm an toàn, không cần giữ tương thích ngược).
2. **Route** (`routes/tournamentGames.js`): đọc `page`/`limit` từ
   `req.query` giống `routes/games.js`, trả `{ games, pagination }`.
3. **Client** (`tournament-detail.js`): thêm state `currentGamesPage`, nút
   trang trước/sau (hoặc "tải thêm") trong tab Games, gọi lại
   `loadGamesHistory(page)` khi đổi trang thay vì luôn tải hết.

## Bẫy cụ thể

- Giữ `ORDER BY started_at ASC` — đổi hướng sort sẽ đổi nghĩa hiển thị hiện
  tại (ván cũ nhất trước), không đổi trừ khi có yêu cầu riêng.
- `gameMatchLabel()` (dòng 899-905) tra `pairingsById` (Map trong bộ nhớ,
  load từ `tournament:get`/`tournament:updated`) để hiện nhãn vòng đấu — với
  phân trang, đảm bảo `pairingsById` vẫn có đủ pairing cho các game ở trang
  hiện tại (thường luôn đủ vì `pairingsById` load toàn bộ pairing của giải,
  không phân trang riêng — chỉ games mới phân trang).
- Với giải đấu nhỏ (dưới 1 trang), UI phân trang nên tự ẩn — tránh hiện nút
  "trang sau" vô nghĩa khi chỉ có 1 trang dữ liệu.

## Không thuộc phạm vi (đừng gộp vào fix này)

- Không đổi replay viewer (`history.html`) hay endpoint
  `GET /api/tournament-games/:id` (lấy 1 ván đầy đủ) — endpoint đó vốn đã
  lấy đúng 1 hàng, không cần phân trang.
- Không đổi cách `routes/games.js` (games thường, không phải tournament)
  phân trang — đã đúng sẵn, chỉ dùng làm khuôn mẫu tham khảo.
