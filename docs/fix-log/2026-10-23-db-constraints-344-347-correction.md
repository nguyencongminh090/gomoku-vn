# 2026-10-23 16:58 — correction to the #344-#347 entry: the real DB is already at v14
## Prompt
"Do #344 - #347" (follow-up check)
## Root cause
Pre-existing test leak (#348): PrivateChatHandler/SocketHandler/flood-protection suites open the default server/db/gomoku.db, so `npm test` at 16:31 applied migrations 010-014 to the live file.
## Fix
None to data. Live file checked: user_version 14, integrity_check ok, foreign_key_check empty, 30 users / 542 rating_history (same as the pre-migration copy), is_admin gone.
## Verification
- The earlier row's "Not verified: production boot… on next restart" is wrong: the schema is live now; the running server (started 16:03) still runs pre-branch code (it writes tournament_pairings.moves on a tournament game end, which now errors; no active tournament).
- Restarting on a build without migrations 010-014 refuses to boot (user_version newer than app).
