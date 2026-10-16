# 2026-10-16 — #256 club_log capped at 500 rows/club
## Prompt
Do #256
## Root cause
`ClubService.log()` only inserted; club_log grew forever (other tables already bounded; see todo).
## Fix
`log()` now deletes rows of that club with id <= the 500th newest (`LOG_KEEP`), same pattern as club chat/DM caps. No global timer; games/rating_history untouched. `log`/`LOG_KEEP` exported for the test. Branch feature/256-club-log-cap.
## Verification
server/tests/club-log-cap.test.js (510 inserts -> 500, newest kept, other club untouched). npm test: 3242 pass. Not run against the real DB.
