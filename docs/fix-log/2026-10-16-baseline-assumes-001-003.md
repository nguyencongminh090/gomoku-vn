# 2026-10-16 16:00 — #255 follow-up: baseline stamp assumed migrations 001-003
## Prompt
Review #255 item #3 → "Fix #3"
## Root cause
runMigrations stamps a version-0 DB as baseline 3, which asserts the hand-run migrations 001-003 were applied.
Nothing checked it: a DB missing 003 was stamped without users.last_login_at; one missing 002 was stamped and
later failed at 005's foreign_key_check (orphan guest ids) with an unhelpful "foreign key violation".
## Fix
legacy-upgrade.js: 001 needs nothing (index is in schema.sql); 003 healed with a gated ALTER ADD COLUMN;
002 (deletes orphan rows) is NOT run unattended — assertMigration002 throws before the stamp, naming the
missing FKs and the manual command. Version stays < 3 so the next boot retries.
## Verification
db-migrate.test.js +3 (missing 003; games / player_games without users FK), failed before the fix.
npm test: 3259 pass. legacy upgrade run on a copy of the real gomoku.db: passes (FKs present).
