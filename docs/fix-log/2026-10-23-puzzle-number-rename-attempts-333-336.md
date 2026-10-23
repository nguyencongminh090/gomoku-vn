# #333-#336 — puzzle number, rename, attempt cap, attempt record
**Prompt:** "DO #332 - 336" (decisions: 3 tries/puzzle never reset, solved exempt; solvers+tries public; "Title #n"; rename author or reviewer)
**Layer:** schema (migration 007: puzzles.number + unique idx, puzzle_attempts), PuzzleService (findRow by uuid|number, renamePuzzle, solve cap 429, solvers/myAttempts), routes, client puzzle/puzzles/mine/review pages, i18n.
**Tests:** puzzles-route (68), db-migrate (007 backfill), jsdom solve page + mine rename; browser pass desktop+mobile on an isolated server.
