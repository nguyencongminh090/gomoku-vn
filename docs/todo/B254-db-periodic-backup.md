# B254 — Periodic SQLite backup via db.backup()
**Status:** OPEN
**Area:** server/db/database.js (or new server/db/backup.js), server/db/backups/, tests
**From:** DB architecture review 2026-10-16   **Depends:** —

## Problem
Last file in `server/db/backups/` is 2026-08-10; no scheduled job. `.bak-pre-*` copies sit beside the live DB. Copying a WAL-mode `.db` file by hand can be inconsistent.

## Scope
1. Timer (unref'd, like walTimer) calling better-sqlite3 `db.backup(dest)`; daily, file `gomoku-<ISO>.db`.
2. Keep last N (default 7), delete older; N and interval via env with defaults.
3. Skip when `NODE_ENV=test`; test with a temp DB path.
4. Check `.gitignore` covers `server/db/*.db*` and `backups/`.

## Don't
- Don't copy the file with fs; don't block the event loop on failure (log + retry next tick).

## Traps
- `db.backup()` is async: a failed backup must not leave a half file counted as a good one (write to `.tmp`, rename).

## Why this way
`db.backup()` is the SQLite online-backup API (safe under WAL). Rejected: `VACUUM INTO` (exclusive read lock longer), cron outside the app (extra moving part). Notes: `docs/knowledge/db-backup-restore-retention.md` (VACUUM INTO / backup API, rotation, restore test).

## Done when
- Backup file appears, opens, `integrity_check=ok`; rotation keeps N; unit test with temp DB; `npm test` green.
