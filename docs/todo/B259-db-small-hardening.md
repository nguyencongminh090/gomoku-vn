# B259 — DB small hardening: DB_PATH env, json_valid, orphan sessions, unused index, trusted_schema, LIKE escape
**Status:** OPEN
**Area:** server/db/database.js, schema.sql
**From:** DB architecture review 2026-10-16   **Depends:** B255 (for schema changes)

## Problem
`DB_PATH` hard-coded; `games.moves/walls/portals` accept invalid JSON; `idx_games_room_id` unused (no query filters on room_id; only admin.js selects it); games players stored in both games.*_player_id and player_games. (`sessions.user_id` FK ruled out, see Decision.)

## Scope
1. `DB_PATH` from `GOMOKU_DB_PATH` env, default unchanged (check playwright-e2e-safety expectations).
2. `CHECK(moves IS NULL OR json_valid(moves))` via migration.
3. Drop `idx_games_room_id` in a migration (after #255).
4. Query to detect black/white vs player_games drift; report only.
5. `PRAGMA trusted_schema = OFF` on the connection in database.js (not set today); check nothing in schema.sql relies on it.
6. Escape LIKE in `buildGameFilters` (`filters.player`): reuse `likeEscape` (database.js:1220, used only by searchRankings) and add `ESCAPE` to the clause; test `%`/`_` input matches literally.

## Decision (2026-10-16, assistant by research, user delegated)
- NO FK on `sessions.user_id`: guests get `guest_<uuid8>` ids that are never in `users` (schema.sql comment, routes/auth.js POST /guest); an FK would kill every guest session. Orphan check on registered sessions (`is_guest=0`) found 0 today; no change.
- DROP `idx_games_room_id`: unused, write cost only; re-add if a per-room history feature appears.

## Don't
- Don't add an FK to sessions; don't drop any other index.

## Traps
- Guests have non-null `guest_xxxx` user_ids in sessions (not NULL) — the reason there is no FK.

## Why this way
Each is small and independent; bundled to avoid 4 tracking files. Notes: `docs/knowledge/db-constraints-check-fk-sqlite.md`; SKILLS_TREE (reference) `database/items/db-sqlite-pragmas-wal-transactions.md`, `db-sqlite-security-hardening.md`.

## Done when
- Env override tested; CHECK rejects bad JSON; `idx_games_room_id` dropped; `trusted_schema` off; player filter with `%`/`_` matches literally (test).
