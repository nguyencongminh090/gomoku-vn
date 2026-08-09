# Fix log entry — 2026-08-09 10:31

## Prompt

Do #84 (TODO.md #84 / instruction.md B84): tournament Games History tab's
`getTournamentGames()`/`GET /api/tournaments/:id/games` has no `LIMIT`/
pagination, and the client renders the entire result as one synchronous
`innerHTML` table build — UI jank switching to the Games tab on a tournament
with many games (series mode, many rounds).

## Action

- **Server**: `getTournamentGames(tournamentId, limit = null, offset = 0)`
  (`server/db/database.js`) — `limit == null` keeps the old unpaginated
  behavior (needed by existing direct callers in
  `TournamentMatchHandler.test.js`), otherwise adds `LIMIT ?/OFFSET ?`. New
  `getTournamentGameCount(tournamentId)`. `GET
  /api/tournaments/:tournamentId/games` (`server/routes/tournamentGames.js`)
  now parses `page`/`limit` off `req.query` exactly like `routes/games.js`
  (`limit` capped at 50) and returns `{ games, pagination: { page, limit,
  total, totalPages } }`.
- **Client** (`client/js/tournament-detail.js`): `loadGamesHistory(page = 1)`
  fetches `?page=&limit=20` and caches `gamesPagination`; `renderGamesHistory()`
  now also calls a new `renderGamesPagination()` that renders `‹ 1 2 ›`-style
  buttons (same shape as `history.js`'s `renderPagination`), auto-hides when
  `totalPages <= 1`, and re-fetches the clicked page. `.pagination` CSS added
  to `client/css/tournament.css` (the tournament detail page loads
  `tournament.css`, not `history.css`, so the existing `.pagination` rules in
  `history.css` weren't reachable there).
- Bumped cache-bust `?v=93` across every `client/*.html` and every
  `import '...?v=N'` in `client/js/*.js` (verified with the repo's grep — one
  distinct version number, excluding the two frozen mockups).

## Decision

Scope kept to exactly what instruction.md described: `ORDER BY started_at
ASC` unchanged, `GET /api/tournament-games/:id` (single full game, replay)
untouched — that endpoint already returns exactly one row.
`pairingsById`-driven round labels (`gameMatchLabel()`) needed no change:
pairings are loaded unpaginated from `tournament:get`, independent of games
pagination, as instruction.md's pitfall note anticipated.

## Summary output

- `server/db/database.js`: `getTournamentGames` gains optional
  `limit`/`offset`; new `getTournamentGameCount`.
- `server/routes/tournamentGames.js`: `GET
  /api/tournaments/:tournamentId/games` now paginated.
- `client/js/tournament-detail.js`, `client/css/tournament.css`: pagination
  UI for the Games History tab.
- `server/tests/tournamentGames-route.test.js` (new): 15 tests — database
  layer (no-limit default, exact page slices, offset past the end, empty
  tournament) and route layer (default page/limit, partial last page, custom
  limit, limit capped at 50, page beyond `totalPages`, malformed query
  params, negative page/limit, tournament scoping, unknown tournament id).
- `npm test`: 40 suites / 966 tests passing.
- Verified against a real running server + real browser (Playwright), not
  just the Jest suite: per the repo's Playwright/db-safety rule, moved the
  real `server/db/gomoku.db` aside, booted the server against a fresh empty
  db, created one real round-robin tournament through the actual socket API
  (two guest sessions, register, start), inserted 25 `tournament_games` rows
  directly via sqlite for that tournament's real `tournament_id`/
  `pairing_id`/entry ids (satisfies the real `foreign_keys = ON` schema), then
  drove a headless Chromium session through the real guest-login UI flow to
  `tournament.html?id=...` → Games tab. Confirmed: page 1 shows exactly 20
  rows with `‹ 1 2 ›` pagination controls, clicking "2" loads the remaining 5
  rows, zero console errors. Restored the real `gomoku.db` afterward
  (verified identical file size before/after) and killed the temporary
  server process.
- Branch: `fix/tournament-games-pagination`, off `dev` (TODO.md #84's
  tracking entry — and its `docs/todo/`/`docs/instruction/` detail files —
  exist only on `dev`, not `main`, per the git workflow's
  dev-only-tracking-entry exception).
