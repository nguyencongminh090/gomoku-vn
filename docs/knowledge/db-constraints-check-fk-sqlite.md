---
name: db-constraints-check-fk-sqlite
description: Adding integrity constraints to a SQLite schema - NOT NULL, enum-style CHECK, json_valid CHECK, STRICT tables, FOREIGN KEY actions (CASCADE, SET NULL, RESTRICT), nullable FK for guest rows, indexing child keys, and a safe order to backfill an existing database
domain: database
tags: sqlite,constraints,check,foreign-key,strict-tables,json-valid,on-delete,foreign-key-check,schema,migrations
apply_when: "tightening an existing SQLite schema; enum-like text columns accept any string; JSON stored in TEXT may be malformed; deleting a parent row leaves orphans; guest or anonymous rows need an optional owner; deciding CASCADE versus SET NULL"
sources: "SQLite - CREATE TABLE (CHECK, NOT NULL), S15 (read); SQLite - STRICT Tables, S16 (read); SQLite - Foreign Key Support, S17 (read); SQLite - Pragma statements, S1 (read, foreign_key_check, ignore_check_constraints); SQLite - ALTER TABLE, S14 (read); SQLite - JSON functions, S18 (json_valid listed); local run on 3.46.1, L2"
last_reviewed: 2026-10-16
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/database/items/db-constraints-check-fk-sqlite.md
copied: 2026-10-16
---

# CHECK, FOREIGN KEY and STRICT constraints in SQLite

Constraints move rules from application code into the file, so every writer (scripts, a second service, a manual fix) is
held to them. Connection settings are in `db-sqlite-pragmas-wal-transactions`; the step-by-step schema change is in
`db-sqlite-migrations-user-version`; general modeling is in `be-data-modeling-migrations`.

## Which constraint for which rule

| Rule | Tool | Fact to know |
|---|---|---|
| Column must have a value | `NOT NULL` | Column-level only, not a table constraint (S15). Checked on write, not on read (S15). |
| Value from a fixed set (status, role) | `CHECK (col IN ('a','b'))` | A CHECK that evaluates to NULL is not a violation (S15), so pair it with `NOT NULL` when NULL is not allowed. Cannot contain a subquery (S15). |
| Text must be valid JSON | `CHECK (col IS NULL OR json_valid(col))` | `json_valid` is part of the built-in JSON functions (S18). It also accepts JSON5 text on 3.42.0 and later (S18), so check the flags argument if strict RFC 8259 matters. |
| Column holds only integers, reals, text | `STRICT` table option | 3.37.0 or later; allowed types are INT, INTEGER, REAL, TEXT, BLOB, ANY; a value that cannot be converted losslessly raises an error instead of being stored as-is (S16). A database with a STRICT table cannot be opened by older SQLite (S16). |
| Row must point to an existing parent | `REFERENCES parent(id)` | Enforced only when `PRAGMA foreign_keys = ON` for that connection (S1, S17). |
| Number in a range | `CHECK (n BETWEEN 0 AND 100)` | Same NULL rule as above. |

## Foreign key actions

The action is chosen per constraint for `ON DELETE` and `ON UPDATE` (S17):

- `NO ACTION` (default): the delete fails if children exist.
- `RESTRICT`: like NO ACTION but checked immediately, even for a deferred constraint (S17). Use it when deleting a parent
  with children is a bug.
- `CASCADE`: children are deleted (or updated) with the parent. Use for rows that have no meaning alone, such as the lines of an order.
- `SET NULL`: the child column becomes NULL. Use when the child row must survive its owner, for example match history
  after an account is deleted. The column must be nullable.
- `SET DEFAULT`: still fails if no parent matches the default (S17); rarely worth it.

A nullable FK column is also the simplest way to model optional ownership (guest games, anonymous submissions): a NULL
child key never violates the constraint (S17). Do not invent a sentinel parent row such as id 0.

## Index the child key

On parent delete or key change SQLite searches the child table for referencing rows; without an index on the child
column it scans the whole child table (S17). The docs say that in most systems the child key should be indexed, and the
index need not be unique (S17). Local check: with no index, `EXPLAIN QUERY PLAN DELETE FROM users WHERE id=1` showed
`SCAN games`; see `db-query-plan-index-tuning` (L2).

## Adding constraints to an existing database

SQLite's `ALTER TABLE` can add a column (even with a CHECK) but cannot add a constraint to an existing column or change a
column's type (S14); on 3.46.1 `ALTER TABLE ... ADD CONSTRAINT` is a syntax error (L2). The route is the table-rebuild in
S14 section 8, run inside a migration. Safe order:

1. Take a backup (`db-backup-restore-retention`).
2. Find violators first with plain queries: `SELECT ... WHERE status NOT IN (...) OR status IS NULL`,
   `WHERE meta IS NOT NULL AND NOT json_valid(meta)`, and `PRAGMA foreign_key_check` (returns table, rowid, parent table,
   constraint index for each orphan; S1, L2).
3. Fix or null out the bad rows (decide per rule: repair, SET NULL, or delete).
4. Rebuild: create the new table with the constraints, copy rows, drop the old table, rename, recreate indexes and triggers.
   Turn `foreign_keys` off for the rebuild as S14 describes, and back on after.
5. Re-run `PRAGMA foreign_key_check` and `PRAGMA integrity_check`. In STRICT tables `integrity_check` also verifies column
   types (S16); locally it also reported rows that broke a CHECK after `ignore_check_constraints` had been used (L2).
6. Bump `user_version` in the same transaction as the schema change.

`PRAGMA ignore_check_constraints = ON` exists but silences CHECKs for that connection (S1); never leave it on in application code.

## Use when

- Text columns act as enums, a JSON column is written by more than one code path, or deleted accounts leave orphan rows.
- You are writing the migration that tightens a schema that already holds production data.

## Do not use when

- The data is a scratch or cache table that can be rebuilt; constraints only add write cost.
- The rule needs another table's data in a CHECK (subqueries are forbidden, S15); use a foreign key, a trigger or application code.
- Old SQLite builds must read the file and `STRICT` would block them (S16).

## Trade-offs

- Constraints cost a check per write and make migrations that reshape data longer, because every step must keep the rules true.
- `STRICT` turns silent coercion bugs into errors at write time, which can surface latent bugs in code that passed strings for numbers.
- CASCADE is convenient and dangerous: one delete can remove many rows. For data under a retention or privacy rule prefer an explicit job.

## Common mistakes

- Declaring foreign keys and forgetting `foreign_keys = ON` on a new connection, so nothing is enforced.
- A CHECK on a nullable column assumed to reject NULL.
- Adding the constraint before cleaning old rows, so the rebuild copy fails halfway.
- No index on the child key, making each parent delete a full scan.
- Treating a sentinel row (id 0, "guest") as a parent instead of using NULL.

## Related

- Notes: `db-sqlite-migrations-user-version`, `db-sqlite-pragmas-wal-transactions`, `db-query-plan-index-tuning`,
  `db-backup-restore-retention`, `be-data-modeling-migrations`, `data-schema-evolution`
