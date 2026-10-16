---
name: db-backup-restore-retention
description: Safe live backups of a SQLite file (VACUUM INTO, backup API), rotation and restore testing for small apps, and retention deletes that keep the single writer free and reclaim disk space deliberately
domain: database
tags: sqlite,better-sqlite3,backup,restore,retention,vacuum,rotation,integrity-check
apply_when: "scheduling backups of a SQLite database; copying a live .db file; verifying a backup is restorable; deleting old rows from log or event tables; the file does not shrink after deletes"
sources: "SQLite - How to corrupt, 1.2, S9 (read); SQLite - VACUUM, S7 (read); SQLite - Online Backup API, S8 (read); SQLite - Pragma integrity_check, quick_check, auto_vacuum, incremental_vacuum, S1 (read); SQLite - DELETE, S11 (read); better-sqlite3 api.md backup(), B1 (read); local check on sqlite3 3.46.1, L1"
last_reviewed: 2026-10-16
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/database/items/db-backup-restore-retention.md
copied: 2026-10-16
---

# Backup, restore testing and retention (SQLite)

Medium confidence: backup mechanics come from SQLite's own documentation (strong); the rotation and retention schedules are
the author's recommendations for small apps, not a cited standard. Multi-region disaster recovery is in `deploy-resilience-dr`.

## Making a consistent copy of a live database

A plain file copy of a database that is mid-transaction can mix old and new pages and be corrupt (S9). Safe methods on a live
database (S9):

| Method | Notes |
|---|---|
| `VACUUM INTO 'file'` | One SQL statement; output is a consistent snapshot, minimal in size, with deleted content purged. Target must not exist or must be empty (S7). Uses more CPU than the backup API (S7). Locally (L1) the copy kept `user_version` and opened in `delete` journal mode, not WAL. |
| Backup API (better-sqlite3: `db.backup(path)`, returns a promise) | Incremental, so other users keep working; 100 pages per event-loop cycle by default (B1). A write from a different connection restarts the backup (S8, B1), so let one connection do the writing during backups. |
| `sqlite3_rsync` | Copy to or from a remote host over SSH (S9, S8). |
| File copy | Only when no transaction is in progress, and copy `-wal` with the database (S9). |

After `VACUUM INTO` is interrupted by a power loss before completion, the output file may be incomplete (S7). Write to a
temporary name and rename it on success.

## Rotation (small-app default)

1. Write `backup-YYYYMMDD-HHMM.db` to a temp name, verify, rename.
2. Keep a few recent ones (for example daily for 7 days, weekly for 4); delete older ones. Pick numbers from how much data
   loss and how long a restore the app can tolerate, and write them down.
3. Copy at least one backup to a different disk or host. A backup on the same disk does not survive the disk.
4. Make a failed or missing backup visible: have the job report success to a monitor that alerts when no report arrives
   (author's advice; the SQLite docs do not cover scheduling).
5. Compress and encrypt if the data is personal; a backup is a second copy of that data (`appsec-data-protection-privacy`).

## Verify, then trust

A backup that was never opened is a hope. After writing it, open the copy and run `PRAGMA quick_check` (linear time; skips
UNIQUE and index-content checks) or `PRAGMA integrity_check` (more thorough, slower) and expect the single row `ok`
(S1). Neither finds foreign-key violations; run `PRAGMA foreign_key_check` for that (S1 states this limit for integrity_check).
Periodically restore the newest backup into a scratch location and run one real query, which also proves the restore procedure.

## Restore

Stop the writers, keep the damaged file aside, put the backup in place (delete any stale `-wal` and `-shm` belonging
to the old file; a leftover WAL from another database state must not be paired with the restored file), start, run
the check. Rehearse it once.

## Retention of old rows

Log, event and session tables grow forever unless pruned.

- **Index the time column** the retention rule uses, or the delete scans the table (`db-query-plan-index-tuning`).
- **Delete in bounded batches**, each its own short transaction, for example
  `DELETE FROM events WHERE id IN (SELECT id FROM events WHERE created_at < ?1 LIMIT 1000)`, repeated until zero rows change.
  `DELETE ... LIMIT` itself exists only when SQLite is compiled with `SQLITE_ENABLE_UPDATE_DELETE_LIMIT` (S11), so use the
  subquery form (checked locally, L1). One huge delete holds the only writer lock and bloats the WAL
  (`db-sqlite-pragmas-wal-transactions`).
- **A `DELETE` without WHERE** on a table with no triggers uses the truncate optimization and is much faster (S11).
- **The file does not shrink.** Freed pages go to a freelist and are reused by later inserts (S1). If a stable size is
  enough, do nothing. To give space back: `VACUUM` (rewrites the file and can need up to twice its size in free disk, S7), or
  `auto_vacuum=INCREMENTAL` chosen before the first table is created, then `PRAGMA incremental_vacuum(N)` (S1). An existing
  database can be switched by setting `auto_vacuum` and then running `VACUUM` once (S1). `VACUUM` is a write operation: it fails
  if another connection holds a lock that blocks writes, or if its own connection has an open transaction or unfinalized
  statements (S7), so run it from a maintenance window or a quiet moment, with the busy timeout in place.
  `PRAGMA freelist_count` shows how many pages are unused (S1).
- **Keep legal and audit rules in front.** Deleting may be required (privacy) or forbidden (records); decide before coding.

## Use when

- A single-file SQLite database holds data you cannot recreate, or tables grow without bound.

## Do not use when

- The database is a client/server engine: use its own tools (`pg_dump`, physical backups, WAL archiving).
- The data is a rebuildable cache; rebuild instead of backing it up.

## Common mistakes

- Copying the `.db` with `cp` or a file-sync tool while the app runs.
- Backups that never get a check or a restore rehearsal.
- All backups on the same disk as the database.
- Running `VACUUM` on a nearly full disk.
- A retention job that deletes everything in one transaction.

## Related

- Notes: `db-sqlite-pragmas-wal-transactions`, `db-sqlite-migrations-user-version`, `deploy-resilience-dr`,
  `appsec-data-protection-privacy`, `data-storage-selection`
