---
name: db-query-plan-index-tuning
description: Diagnosing a slow SQLite query with EXPLAIN QUERY PLAN and fixing it with composite, covering and partial indexes, plus PRAGMA optimize and the N+1 pattern
domain: database
tags: sqlite,explain-query-plan,index,covering-index,partial-index,composite-index,performance,n-plus-one
apply_when: "a query is slow or scans a whole table; choosing which columns to index and in what order; checking that a new index is used; a page issues one query per row"
sources: "SQLite - EXPLAIN QUERY PLAN, S3 (read); SQLite - Query planner, S4 (read); SQLite - Partial indexes, S5 (read); SQLite - Pragma optimize, S1 (read); local check on sqlite3 3.46.1, L1"
last_reviewed: 2026-10-16
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/database/items/db-query-plan-index-tuning.md
copied: 2026-10-16
---

# Query plans and index tuning (SQLite)

Medium confidence: the SQLite sources agree and the examples were run locally (L1), but the practitioner advice on
N+1 and index cost is the author's synthesis, not a cited source.

## Workflow

1. Take the exact slow statement with real parameter values, or bound parameters in the same form the app uses.
2. Run `EXPLAIN QUERY PLAN <statement>` (CLI: `.eqp on`). Read each row (S3):
   - `SCAN t` is a full pass over the table, including a pass in index order; `SEARCH t USING INDEX i (a=?)` visits a subset.
   - `USING COVERING INDEX` means the table itself is never read.
   - `USE TEMP B-TREE FOR ORDER BY` (or GROUP BY, DISTINCT) means an extra sort; an index that matches the order removes it.
3. Change one thing (an index, or the query), run the plan again, then time the real query on realistic data volume.
   A plan on a ten-row dev table proves nothing.
4. Keep the index only if the plan changed and the timing improved.

Local example (L1, 20,000 rows, `WHERE user_id=5 ORDER BY created_at DESC LIMIT 20`): with no index the plan was
`SCAN events` plus `USE TEMP B-TREE FOR ORDER BY`; after `CREATE INDEX ON events(user_id, created_at)` it became
`SEARCH events USING COVERING INDEX ... (user_id=?)` with no sort.

## Index design rules

- **Equality columns first, then the range or sort column.** A multi-column index is ordered by its first column, ties broken
  by the second, and so on (S4). The example above works because `user_id` is matched by equality and `created_at` is
  already in order inside it.
- **Prefix rule.** Never keep two indexes where one is a prefix of the other; drop the shorter one (S4).
- **Covering index.** Appending the selected columns to the index lets SQLite skip the table lookup. S4 describes this as
  roughly a doubling for such lookups, a refinement rather than a big win. Do it for hot, narrow queries, not everywhere.
- **Partial index.** `CREATE INDEX ... WHERE <expr>` indexes only some rows, saving space and write cost (S5). The planner
  uses it only when the query's WHERE clause implies the index's WHERE; SQLite checks this with simple term matching, and the
  terms must match exactly (S5). Locally (L1), `WHERE status='failed'` used a partial index on `status='failed'`, while
  `WHERE status=?` did not, because the planner cannot know the parameter. Write the literal in the query when you rely on
  a partial index.
- **Every index slows writes and takes space.** Add them from observed queries, not by habit (`be-data-modeling-migrations`).

## Keeping statistics fresh

- Run `PRAGMA optimize` just before closing short-lived connections, and after schema changes especially `CREATE INDEX`;
  long-lived connections run `PRAGMA optimize=0x10002` at open and `PRAGMA optimize` periodically, such as daily (S1).
  It is usually near-free and runs ANALYZE only where it may help.

## N+1

If a request runs one query per row of a previous result, the plan of each query may look perfect and the total still be slow.
In SQLite the per-query cost is small (no network), so it matters less than on a client/server database, but it still
multiplies. Fix it with a JOIN or with one `WHERE id IN (...)` query, and compare total time, not per-query time.

## Use when

- Diagnosing latency in a SQLite-backed app; reviewing a migration that adds indexes.

## Do not use when

- The data is tiny (hundreds of rows): an index will not matter and costs writes.
- The engine is not SQLite. EXPLAIN output and planner rules differ in PostgreSQL and MySQL.
- The slowness is lock waiting (SQLITE_BUSY) rather than scanning; see `db-sqlite-pragmas-wal-transactions`.

## Common mistakes

- Indexing a column and then wrapping it in a function or expression in WHERE, so the index is unusable.
- Reading the plan without the real parameter shape (partial indexes, LIKE patterns).
- Ordering a composite index with the range column before the equality column.
- Testing on a toy dataset.

## Related

- Notes: `db-keyset-pagination`, `db-sqlite-pragmas-wal-transactions`, `be-data-modeling-migrations`, `quality-performance`
