# 2026-10-16 13:42 — #255 DB versioned migrations on user_version
## Prompt
Do #255
## Root cause
user_version was 0; ~20 inline PRAGMA table_info+ALTER blocks ran every boot, so DB version was unknowable and only additive changes were possible.
## Fix
New server/db/migrate.js (runner, baseline 3, tx per file, refuses newer DB, `-- rebuild` flag) and legacy-upgrade.js (old ALTER blocks moved verbatim, run once for DBs below baseline). database.js calls both. ensureOauthUniqueIndex stays outside the gate (runs every boot) to keep the #94/#100 self-healing. No table shape changed; migrations/001-003 untouched; how-to in migrations/README.md. Branch feature/255-db-migrations.
## Verification
server/tests/db-migrate.test.js (fresh, old, current, rollback, newer-DB, rebuild). npm test: 3241 pass. Not run against the real gomoku.db or a production copy.
