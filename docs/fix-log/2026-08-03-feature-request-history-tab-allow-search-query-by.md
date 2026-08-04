# Fix log entry — 2026-08-03 01:14

## Prompt

Feature request (History tab): allow search/query by player, date, results, plus count-by-date and count-by-result stats.

## Action

Added filterable [database.js](server/db/database.js) query builder `buildGameFilters()` shared by `getRecentGames`, `getGameCount`, and two new functions `getGameStatsByDate`/`getGameStatsByResult`. [routes/games.js](server/routes/games.js) parses `player`/`from`/`to`/`result` query params (`parseGameFilters`, malformed values silently dropped) and applies them to `GET /api/games`; added `GET /api/games/stats` (mounted before `/:id` so the literal path isn't swallowed as a game id) returning `{ byDate, byResult }` for the same filters. Client: [history.html](client/history.html) gained a search form (player text input, from/to date inputs, result select) and a stats panel above the game list; [history.js](client/js/history.js) wires the form to rebuild the query string and re-fetch both the list and `/stats` on submit/reset; styled in [history.css](client/css/history.css). Bumped `?v=37` → `?v=38` across all client HTML/entry files per the cache-busting rule.

## Decision

Result filtering uses `winner`'s existing normalized values (`'draw'` vs a non-null seat) rather than adding a new column; date range is inclusive both ends via `YYYY-MM-DDT00:00:00.000Z`/`T23:59:59.999Z` boundaries compared against the existing ISO `ended_at` strings, no schema change needed. Stats-by-result and stats-by-date both apply the full filter set (including `result`) for consistency with the list route, even though filtering stats-by-result by result itself is a trivial case — kept the single shared `buildGameFilters` rather than special-casing. No `instruction.md` entry existed for this (new feature, not from the TODO/instruction backlog).

## Summary output

`npm test`: 334/334 passing (20 new cases in [games-route.test.js](server/tests/games-route.test.js) covering player/date/result filters individually and combined, malformed-date fallback, and both stats endpoints). Manually verified via a scratch server instance (port 3901, temporary rows inserted and removed) that `GET /api/games?player=...` and `GET /api/games/stats` return correctly filtered results against the real schema; confirmed `/stats` resolves before `/:id`. Also confirmed all new client assets serve 200 and the search-form markup renders in the HTML — no headless browser available in this environment for a full visual/interaction check.
