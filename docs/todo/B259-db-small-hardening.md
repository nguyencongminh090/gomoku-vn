# B259 — DB small hardening: DB_PATH env, json_valid, orphan sessions, unused index
**Status:** OPEN
**Area:** server/db/database.js, schema.sql
**From:** DB architecture review 2026-10-16   **Depends:** B255 (for schema changes)

## Problem
`DB_PATH` hard-coded; `games.moves/walls/portals` accept invalid JSON; `sessions.user_id` has no FK (orphans possible); `idx_games_room_id` may be unused; games players stored in both games.*_player_id and player_games.

## Scope
1. `DB_PATH` from `GOMOKU_DB_PATH` env, default unchanged (check playwright-e2e-safety expectations).
2. `CHECK(moves IS NULL OR json_valid(moves))` via migration.
3. Decide with user: FK on sessions.user_id (ON DELETE CASCADE) vs keep; drop idx_games_room_id after confirming no query uses it.
4. Query to detect black/white vs player_games drift; report only.

## Don't
- Don't enable the FK or drop the index without the user's yes.

## Traps
- Guest sessions have NULL user_id (fine for FK); check no placeholder ids exist.

## Why this way
Each is small and independent; bundled to avoid 4 tracking files. Notes: `docs/knowledge/db-constraints-check-fk-sqlite.md`; SKILLS_TREE (reference) `database/items/db-sqlite-pragmas-wal-transactions.md`, `db-sqlite-security-hardening.md`.

## Done when
- Env override tested; CHECK rejects bad JSON; decisions on FK/index recorded here.
