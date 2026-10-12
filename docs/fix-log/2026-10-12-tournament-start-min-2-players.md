# 2026-10-12 08:05 — #238 Reject tournament start with <2 players
## Prompt
"Do #237 #238 #247 (sequencely and commit + merge)"
## Root cause
startTournament flipped draft→active before checking entry count; with <2 entries no pairing exists, so only cancel could end it.
## Fix
TournamentManager.startTournament: return { code: 'NOT_ENOUGH_PLAYERS' } before any status change. The >=2 path is untouched (its inner `entryIds.length >= 2` check is now always true; left as-is). Client already shows the server `error` string, so no i18n/client change. Branch fix/238-start-min-players.
## Verification
Tests: 0 and 1 players rejected (status stays draft in memory + SQLite), 2 succeeds; six existing tests that started with 0 players now register 2 first. npm test run before commit. Not verified in a real browser.
