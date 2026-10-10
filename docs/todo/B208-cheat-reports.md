# B208 — R8: cheat reports (member reports a finished game → staff queue)
**Status:** ✅ DONE 2026-10-10 — reviewed: member reports a finished casual game from /replay (form → row; duplicate is a no-op), moderator sees it in the Gian lận tab and in the unified table, Confirm → `cheat_confirm` edge, report resolved, account NOT locked; member staff-API → 403; limits (10/24 h, reason 1–200, no guest/self/tournament) covered by cheat-reports.test.js. Note: the report form is also shown to the accused on their own game (server refuses CHEAT_SELF; harmless).
**Area:** server (game_reports table, CheatReportService, POST /api/games/:id/report, /api/admin/cheat-reports*, perm cheat.review) + client (replay report form, /admin "Gian lận" tab)
**From:** user 2026-10-10 "Làm tiếp cheat flags" (answer: members report games)   **Depends:** B205, B206

## Scope
1. `game_reports(id, game_id, reporter_id, accused_id, reason, created_at, resolved_at, resolved_by, resolution)`, UNIQUE(reporter, game, accused). Casual `games` only, finished, accused = a member seat (not a guest, not the reporter). 10 reports / 24 h / reporter; reason 1–200.
2. Staff (moderator+admin, `cheat.review`): queue with game summary + replay link + how many open/confirmed reports the accused already has; Dismiss / Confirm. Confirm logs a `cheat_confirm` edge actor→accused in the change graph; both close every open report on the same (game, accused).
3. Replay page: "Báo gian lận" form for logged-in members.

## Don't
- No automatic detection, no auto-lock/penalty (lock stays an admin action in Users tab), no tournament games (`tournament_games` is a separate table), no rating rollback.
- Reporter identity is shown to staff only.

## Traps
- `getGameById` strips player ids; the server resolves the accused from the row by seat (BLACK/WHITE), never trusts a client id.
- Reports on a game whose accused later deleted their account: show "(đã xoá)".
