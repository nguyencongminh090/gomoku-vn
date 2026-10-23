# B345 — Tournament results stored twice + missing json_valid
**Status:** ✅ FIXED 2026-10-23 (branch fix/344-347-db-constraints; migrations 010-014 + db-constraints-344-347.test.js; live DB copy migrated clean)
**Area:** server/db/tournaments.js, schema.sql, migrations/
**From:** DB design review 2026-10-23   **Depends:** —

## Problem
`tournament_pairings` (`moves`, `games`, `result`) and `tournament_games` (`moves`, `winner`) both
hold game results; no declared owner. JSON columns `tournament_games.moves/walls/portals`,
`tournament_pairings.moves/games`, `puzzles.stones/answers/layout` lack `json_valid` CHECKs
(`games` got them in B259).

## Scope
1. Document which table owns per-game data; remove or derive the duplicate.
2. Add `CHECK (col IS NULL OR json_valid(col))` via table rebuild migration (heal bad rows first).
3. Test: malformed JSON insert is rejected; tournament flow tests stay green.

## Don't
- Normalize moves into child tables (see DB_REVIEW #8).

## Traps
- Rebuild must keep FKs/indexes; run foreign_key_check after.
- Live data: only 1 tournament, but migration must be idempotent.

## Done when
- Owner documented, checks live, tests + fix-log.
