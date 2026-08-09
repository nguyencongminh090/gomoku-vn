# Phần B #84. Tab "Lịch sử ván đấu" giải đấu: query không phân trang + render bảng đồng bộ bằng `innerHTML`

**Nguồn:** báo cáo người dùng — "moving in tournament (navigate, comein/out...) sometimes slow" (2026-08-09), điều tra qua [docs/tournament-navigation-latency-report.md](../tournament-navigation-latency-report.md) mục 3.4.

## Vấn đề đã xác nhận (đọc code qua CodeGraph, không suy đoán)

`getTournamentGames()` (`server/db/database.js:715-724`):
```sql
SELECT ... FROM tournament_games WHERE tournament_id = ? ORDER BY started_at ASC
```
Không có `LIMIT`/offset nào. Index `idx_tournament_games_tournament_id` đã có
sẵn nên bản thân truy vấn vẫn nhanh, nhưng **số dòng trả về không giới hạn** —
với giải đấu chạy nhiều vòng / bật `seriesMode` nhiều ván mỗi cặp đấu (B50),
số hàng tăng không có trần.

Client (`client/js/tournament-detail.js:907-955`, `loadGamesHistory()`) fetch
REST riêng (`/api/tournaments/:id/games`) rồi dựng **toàn bộ bảng HTML bằng
chuỗi `innerHTML`** trong 1 lần đồng bộ (`gamesHistory.map(...).join('')`).
Với giải đấu có hàng trăm ván, đây là điểm giật UI khi user chuyển sang tab
"Games" (một dạng "navigate" trong-trang) — đặc biệt trên máy yếu/điện thoại.

## Việc cần làm

Xem hướng dẫn chi tiết: [docs/instruction/B84-tournament-games-history-khong-phan-trang.md](../instruction/B84-tournament-games-history-khong-phan-trang.md).

## Trạng thái

✅ ĐÃ XONG.

- **Server:** `getTournamentGames(tournamentId, limit, offset)` (`server/db/database.js`)
  nhận thêm `limit`/`offset` tuỳ chọn (mặc định `null` = trả hết, giữ tương thích
  các lời gọi trực tiếp có sẵn trong `TournamentMatchHandler.test.js`); thêm
  `getTournamentGameCount(tournamentId)`. `GET /api/tournaments/:id/games`
  (`server/routes/tournamentGames.js`) parse `page`/`limit` giống hệt khuôn mẫu
  `routes/games.js` (cap `limit` ở 50), trả `{ games, pagination }`. Giữ nguyên
  `ORDER BY started_at ASC` và endpoint `GET /api/tournament-games/:id` (1 ván
  đầy đủ) như instruction.md B84 yêu cầu.
- **Client:** `tournament-detail.js` — `loadGamesHistory(page)` fetch có
  `page`/`limit=20`, cache `gamesPagination`; `renderGamesHistory()` render
  thêm `renderGamesPagination()` (nút ‹ số trang ›, cùng khuôn mẫu
  `history.js`/`renderPagination`, tự ẩn khi `totalPages <= 1`). CSS `.pagination`
  thêm vào `client/css/tournament.css` (tournament.html không nạp `history.css`).
  Bump cache-bust `?v=93` (tất cả `client/*.html` + mọi `import '...?v=N'` trong
  `client/js/*.js`, verify bằng `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup`).
- **Test:** `server/tests/tournamentGames-route.test.js` (mới, 15 test) — pagination
  ở tầng `database.js` (limit/offset/offset-quá-cuối/tournament rỗng) và tầng route
  (default page/limit, trang lẻ, limit tuỳ chỉnh, cap 50, trang vượt totalPages,
  query hỏng rơi về default, scope đúng tournament, tournament không tồn tại).
  `npm test`: 966/966 pass (đã bao gồm 15 test mới).
- **Xác nhận UI thật (không chỉ test backend):** dựng server tạm với DB rỗng
  (theo quy tắc Playwright/db-safety — di chuyển `gomoku.db` thật sang chỗ khác
  trước, khôi phục lại sau), tạo 1 giải round_robin thật qua socket API (2 guest),
  chèn thẳng 25 hàng `tournament_games` cho đúng `tournament_id`/`pairing_id`/
  `entry_id` thật (thoả FK) rồi dùng Playwright điều khiển trình duyệt thật:
  tab "Lịch sử ván đấu" hiện đúng 20 dòng + nút phân trang `‹ 1 2 ›`, bấm sang
  trang 2 hiện đúng 5 dòng còn lại, không có console error. Đã khôi phục
  `gomoku.db` thật nguyên vẹn sau khi test xong (kiểm tra lại kích thước file
  khớp trước/sau).
