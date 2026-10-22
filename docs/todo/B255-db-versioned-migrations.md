# B255 — Versioned migrations on PRAGMA user_version
**Status:** ✅ DONE 2026-10-16 (uncommitted on feature/255-db-migrations)
**Area:** server/db/database.js (~20 inline ALTER blocks), server/db/migrations/, schema.sql, tests
**From:** DB architecture review 2026-10-16   **Depends:** B254 (backup first)

## Problem
`user_version=0`. Three mechanisms coexist: manual `migrations/001-003.sql`, ~20 `PRAGMA table_info`+`ALTER ADD COLUMN` blocks run every boot, `schema.sql` IF NOT EXISTS. DB version unknowable; only additive changes possible (no table rebuild, CHECK, type change).

## Scope
1. Runner: read `user_version`, apply `migrations/NNN_*.sql` in order, each in a transaction, bump `user_version`.
2. Baseline migration = current full schema; existing DBs (user_version 0 with tables) are stamped baseline without re-running.
3. Move the inline ALTER blocks into the baseline path; delete them from database.js.
4. Tests: fresh DB, old DB (pre-ALTER columns missing), already-current DB, failing migration rolls back.
5. Document the "add a migration" step in `.claude/rules` or `server/db/README`.

## Don't
- Don't change any table shape in this item; no data rewrites.
- Don't edit existing `migrations/00x` files.

## Traps
- `db.exec(schema.sql)` still runs first today; ordering vs runner must keep old DBs bootable (idx_users_oauth UNIQUE upgrade logic must survive).
- Rebuild migrations need `PRAGMA foreign_keys=OFF` outside the transaction.

## Why this way
Expand/migrate/contract: `docs/knowledge/db-sqlite-migrations-user-version.md` (runner, rebuild), `be-data-modeling-migrations.md`, `data-schema-evolution.md`. Rejected: ORM/knex (new dependency for 30 tables).

## Done when
- `user_version` = latest on live-copy DB; 4 test cases above pass; `npm test` green; backup taken before first run on real DB.
