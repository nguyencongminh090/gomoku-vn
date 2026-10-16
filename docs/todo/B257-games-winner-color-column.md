# B257 — games.winner_color with CHECK (split overloaded winner)
**Status:** ✅ DONE 2026-10-16 — see docs/fix-log/2026-10-16-games-winner-color.md
**Area:** schema.sql, migrations/, saveGame + readers of games.winner, scripts/backfill-ratings.js
**From:** DB architecture review 2026-10-16 (DB_REVIEW.md finding #4)   **Depends:** B255

## Problem
`games.winner` holds a player id, `'draw'` or NULL; cannot be typed/constrained; consumers re-derive colour (backfill-ratings maps 'BLACK'/'WHITE'/'draw').

## Scope
1. Migration: add `winner_color TEXT CHECK (winner_color IN ('BLACK','WHITE','DRAW'))`, backfill from `winner` vs black/white_player_id (guests: from moves/other source — check).
2. Write both columns in saveGame (expand); switch readers; keep `winner` until a later contract step.
3. Tests incl. guest games and interrupted (NULL).

## Don't
- Don't drop `winner` in this item.

## Traps
- Guest games have NULL player ids, so id comparison can't recover colour for them; check live data (306 guest rows were nulled in migration 002).

## Why this way
Expand/migrate/contract (`docs/knowledge/data-schema-evolution.md`); CHECK needs a table rebuild: `db-sqlite-migrations-user-version.md`; constraint rules (NULL passes CHECK, backfill order): `db-constraints-check-fk-sqlite.md`. Rejected: in-place retype (SQLite rebuild + old code live).

## Done when
- Backfill row counts match; CHECK rejects bad value; readers use winner_color; `npm test` green.
