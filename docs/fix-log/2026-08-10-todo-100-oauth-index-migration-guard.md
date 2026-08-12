# Fix log entry — 2026-08-10 13:40

## Prompt

Do #95-#102 (TODO.md), 8 findings from `/code-review` on `feature/oauth-login`
before it merged to `dev` (2026-08-10). This entry covers #100.

## Action

The `idx_users_oauth` migration block (`server/db/database.js`, added by
#94) was the one migration in the file NOT gated on "target state already
reached" — the 4 blocks above it all check `if (!columns.includes(...))`
before running an `ALTER TABLE`, reducing to a cheap no-op check on every
later boot. This block instead ran a full `GROUP BY` duplicate scan over
`users` plus `DROP INDEX`/`CREATE UNIQUE INDEX` on every single startup
forever, even once the index was already `UNIQUE` and nothing had changed.

Added a guard: `PRAGMA index_list('users')`, find the `idx_users_oauth`
entry, check its `unique` flag. If the index already exists and is already
unique, skip the scan-and-upgrade block entirely. Self-healing behavior is
unchanged — if the index is still plain (or missing), the existing
scan/upgrade path runs exactly as before.

## Decision

Followed `docs/instruction/B100-*.md` exactly: same guard pattern as the
neighboring migration blocks, no change to the "don't auto-delete duplicate
data" behavior from #94, and no change to the dedupe/log-and-skip path.

**Test coverage:** new describe block in
`server/tests/oauth-unique-constraint.test.js` — seeds a DB with the index
already `UNIQUE`, spies on `db.prepare()` and asserts no call contains
`GROUP BY` on that boot, then confirms the index is still `UNIQUE`
afterward (the guard didn't accidentally downgrade anything). `npm test`:
47 suites / 1050 tests passing.

## Summary output

- `server/db/database.js`: `idx_users_oauth` migration now gated on
  `PRAGMA index_list('users')` showing it already unique.
- `server/tests/oauth-unique-constraint.test.js`: +2 tests (new describe
  block).
- `docs/todo/B100-*.md` marked done; `TODO.md` #100 line prefixed `✅` in the
  same commit.
- Branch: `fix/oauth-index-migration-guard`, off `dev` and merging back to
  `dev` (OAuth code only exists on `dev`).
