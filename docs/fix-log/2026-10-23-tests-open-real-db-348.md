# 2026-10-23 17:17 — #348 tests no longer open the real server/db/gomoku.db
## Prompt
"Fix #348"
## Root cause
db/connection.js defaults to server/db/gomoku.db when GOMOKU_DB_PATH is unset, and opens + migrates it at require time. Suites without a DB mock (PrivateChatHandler, SocketHandler, flood-protection) load it transitively, so `npm test` migrated the live file (v9→v14 on 2026-10-23 16:31).
## Fix
- package.json jest: setupFiles server/tests/setup/isolate-db.js gives each test file its own temp GOMOKU_DB_PATH (unless it sets one); globalSetup/globalTeardown (setup/db-root.js) create and remove one root dir per run.
- db/connection.js: throws before opening when JEST_WORKER_ID is set and the path resolves to the default file.
- Fixed generically instead of mocking the 3 suites one by one: any future suite is covered.
- Branch: same working tree as #344-#347 (fix/344-347-db-constraints, uncommitted).
## Verification
- New server/tests/db-isolation.test.js (5): temp path per file, unmocked connection opens it, refusal for unset/absolute/relative default path with better-sqlite3 never constructed.
- npm test 196 suites / 3522 green (guard would fail any suite still reaching the default path); 0 temp dirs left after the run.
- Not changed: those suites still hang when run alone (open handle, same on dev baseline).
