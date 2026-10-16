# B254 — Periodic SQLite backup via db.backup() + file permissions, tracked .bak
**Status:** OPEN
**Area:** server/db/database.js (or new server/db/backup.js), server/db/backups/, tests
**From:** DB architecture review 2026-10-16   **Depends:** —

## Problem
Last file in `server/db/backups/` is 2026-08-10; no scheduled job. `.bak-pre-*` copies sit beside the live DB. Copying a WAL-mode `.db` file by hand can be inconsistent.

## Scope
1. Timer (unref'd, like walTimer) calling better-sqlite3 `db.backup(dest)`; daily, file `gomoku-<ISO>.db`.
2. Keep last N (default 7), delete older; N and interval via env with defaults.
3. Skip when `NODE_ENV=test`; test with a temp DB path.
4. DECISION 2026-10-16 (user): current DB data is test/deploy data, wiped before real launch; leaked hashes (commit 87006c5, public repo, still on origin/main) neutralised by regenerating ALL account passwords (names unchanged, sessions revoked) — done, pre-reset backup in ~/gomoku-private-backups/. History purge not requested. DONE 2026-10-16: `git rm --cached` of the tracked .bak (user allowed; file kept on disk, now ignored). History purge NOT done — still open, ask user (origin is on GitHub; commit 87006c5 added it). `.gitignore` already has `*.db`, `*.db-wal`, `*.db-shm`, `server/db/*.bak-*`, but `server/db/gomoku.db.bak-pre-migration-20260801171535` is **tracked in git** (found 2026-10-16; user data from Aug 2026). Ask user: `git rm --cached` only, or also purge history. Never rewrite history unasked.
5. Create backup files and `backups/` with mode 600 / dir 700 (service account only); decide backup retention vs account deletion (deleted rows persist in old backups). See `db-sqlite-security-hardening`.

## Don't
- Don't copy the file with fs; don't block the event loop on failure (log + retry next tick).

## Traps
- `db.backup()` is async: a failed backup must not leave a half file counted as a good one (write to `.tmp`, rename).

## Why this way
`db.backup()` is the SQLite online-backup API (safe under WAL). Rejected: `VACUUM INTO` (exclusive read lock longer), cron outside the app (extra moving part). Notes: `docs/knowledge/db-backup-restore-retention.md` (VACUUM INTO / backup API, rotation, restore test); SKILLS_TREE `database/items/db-sqlite-security-hardening.md` (reference).

## Done when
- Backup file appears, opens, `integrity_check=ok`; rotation keeps N; unit test with temp DB; `npm test` green; file modes checked; tracked `.bak` decision recorded here.
