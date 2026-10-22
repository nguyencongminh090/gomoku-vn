---
name: db-benchmarking-sqlite
description: Method for measuring SQLite query changes - seed a copy with realistic synthetic volume using a recursive CTE, run ANALYZE, warm up, repeat and compare medians, test small and large sizes, and record the query plan next to each timing
domain: database
tags: sqlite,benchmark,performance,measurement,synthetic-data,recursive-cte,analyze,explain-query-plan,better-sqlite3,methodology
apply_when: "before and after adding an index, rewriting a query or changing pagination; a query is fast on the dev database but may not scale; deciding whether a cache or index is worth it; writing a repeatable perf script"
sources: "SQLite - EXPLAIN QUERY PLAN, S3 (read); SQLite - Query planner, S4 (read); SQLite - Pragma statements, S1 (read, optimize, cache_size); SQLite - Write-Ahead Logging, S2 (read, checkpoints); better-sqlite3 performance.md and api.md, B1 (read, 13.0.3); local run on 3.46.1, L3"
last_reviewed: 2026-10-16
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/database/items/db-benchmarking-sqlite.md
copied: 2026-10-16
---

# Benchmarking SQLite queries

A query plan tells you what SQLite will do (`db-query-plan-index-tuning`); a benchmark tells you what it costs on data of
the size you will really have. The goal is a decision ("keep this index", "page with keyset") backed by numbers that
another person can reproduce, not an absolute speed figure.

## Method

1. **Work on a copy.** Make the copy with `VACUUM INTO` or the backup API (`db-backup-restore-retention`) so you never
   time against, or modify, the live file. Never run a seed script against production.
2. **Grow the data to realistic volume.** A recursive CTE generates rows inside SQLite with no driver overhead:

   ```sql
   WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM s WHERE i < 100000)
   INSERT INTO games SELECT i, abs(random()) % 10, abs(random()) % 100000, 'n' || i FROM s;
   ```

   Do the insert in one transaction. Shape matters more than count: match the number of distinct values per indexed column,
   the share of NULLs, the length of text, and skew (a few users with most rows). Uniform random data hides hot-key problems.
3. **Run `ANALYZE` after loading** (and `PRAGMA optimize` as the app does) so the planner has statistics; a plan chosen on
   an empty or unanalyzed table can differ from production (S1, S4).
4. **Record the plan with the timing.** Run `EXPLAIN QUERY PLAN` for each variant and store the text beside the number
   (S3). A fast time with `SCAN` that only works at 1,000 rows is a warning; `SEARCH ... USING INDEX` or `COVERING INDEX`
   explains why a time will hold.
5. **Warm up, then repeat.** Run the statement a few times and discard the first; the first run pays for reading pages
   into the page cache (`cache_size`, S1) and for compiling the statement. Then take N runs (20 or more for millisecond
   queries) and report the median and the worst, not one run.
6. **Compare variants on the same file and the same parameters.** Change one thing at a time: query text, then index, then
   pagination style. Keep a baseline row in every table of results.
7. **Test at least two sizes**, for example a few thousand rows and 100,000 or more. Costs that grow with size (scan,
   deep OFFSET, sort over a whole category) separate from fixed costs.
8. **Measure the path you will ship**, with prepared statements and the same driver. In better-sqlite3 use
   `process.hrtime.bigint()` around `stmt.all()` or `stmt.get()`; prepare outside the loop (B1).

## What to compare (typical questions)

| Question | Variants |
|---|---|
| Is deep paging costly? | `OFFSET 0` against `OFFSET 8000`, then the keyset form (`db-keyset-pagination`) |
| Does a search scan? | `LIKE '%x%'` (no index can serve a leading wildcard) against an indexed prefix or key lookup |
| Is a rank or window query heavy? | A window function over a whole category against a narrower, indexed range |
| Is the index worth its write cost? | Read timing with and without it, plus bulk insert time with and without it |

Local illustration (3.46.1, 100,000 rows, 10 categories, composite index on `(cat, score DESC, id)`, one run each, L3):
the first page and `OFFSET 8000` both ran in about a millisecond, because the index already provided the order. A
`name LIKE '%99%'` count took about 18 ms and a `rank()` window over one category about 15 ms, both scanning. These are
single runs on one machine; treat them as the shape of the comparison, not as figures to cite.

## Pitfalls

- **Cold cache on the first run** and warm cache after: report which one you measured. Production reads are usually warm.
- **WAL and checkpoints**: a write benchmark can include a checkpoint stall in one run only; repeat, and run a checkpoint
  before timing (S2).
- **Synthetic data too clean**: unique values everywhere make indexes look better than real, skewed data.
- **Timing the driver, not the query**: converting 100,000 rows to JavaScript objects can dominate; use `count(*)`, `LIMIT`,
  or `iterate()` when you want engine time only.
- **Machine noise**: close other load, use the same power state, and compare ratios rather than absolute milliseconds.
- **Optimising a query that runs once a day** or one whose cost is network time.

## Use when

- Choosing between two implementations, or checking that a fix really helped before shipping it.
- A claim like "this is slow" or "this index helps" needs numbers in a PR.

## Do not use when

- The plan shows an obvious full scan on a large table: add the index first, measure afterwards.
- The data will always be small (a few thousand rows); the difference will not show.
- You need capacity planning for many concurrent clients; SQLite benchmarks of a single connection do not model writer contention.

## Trade-offs

- A benchmark script is code to maintain; keep it in the repo next to the queries it guards and make it print plan and timing.
- More runs and bigger data give firmer numbers but slower feedback; use a small quick mode for iteration and the large one for decisions.

## Related

- Notes: `db-query-plan-index-tuning`, `db-keyset-pagination`, `db-sqlite-pragmas-wal-transactions`,
  `db-backup-restore-retention`, `quality-performance`
