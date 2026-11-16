# B347 — CHECK constraints for enum and boolean columns
**Status:** ✅ FIXED 2026-10-23 (branch fix/344-347-db-constraints; migrations 010-014 + db-constraints-344-347.test.js; live DB copy migrated clean)
**Area:** schema.sql, migrations/, server/db/*
**From:** DB design review 2026-10-23   **Depends:** B344, B345 (share rebuilds; do together or after)

## Problem
No CHECK on: `users.role`, `users.who_can_dm/challenge/friend`, `clubs.join_policy`,
`tournaments.status/format`, `tournament_pairings.state`, `puzzles.status/mode/level`,
`ratings.category`, `forum_reports.target_type`; 0/1 flags (`hide_*`, `deleted`, `withdrawn`,
`is_guest`) unchecked. Bad values surface only on read.

## Scope
1. Collect allowed values from code (one list per column, no guessing).
2. Rebuild migration adding CHECKs; verify live data passes first.
3. Test: invalid value rejected per table family.

## Don't
- Add CHECKs for values the code can still legitimately write; extend the list instead.

## Traps
- `users` has 26 columns and many ALTER-added: rebuild carefully (batch with B344).
- SQLite can't ADD CHECK via ALTER.

## Done when
- CHECKs live, live data validated, tests + fix-log.
