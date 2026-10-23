# B346 — Decide FKs for actor/reference id columns without constraints
**Status:** ✅ FIXED 2026-10-23 (branch fix/344-347-db-constraints; migrations 010-014 + db-constraints-344-347.test.js; live DB copy migrated clean)
**Area:** schema.sql, migrations/
**From:** DB design review 2026-10-23   **Depends:** —

## Problem
No FK: `admin_edges.actor_id`, `game_reports.reporter_id/accused_id/resolved_by/game_id`,
`news.author_id`, `notifications.actor_id`, `elo_swaps.winner_id/loser_id`,
`rating_history.opponent_id/game_id`. May be intentional (logs survive user deletion) — undocumented.

## Scope
1. Per column: add FK (SET NULL / RESTRICT) or record "intentionally unconstrained" in schema.sql comment.
2. Run `PRAGMA foreign_key_check` on a DB copy before migrating; handle orphans.
3. Test for each added FK.

## Don't
- Add FK to `sessions.user_id` (guests, decided in #259).
- Add a user-delete feature.

## Traps
- `rating_history.opponent_id` may hold guest ids; `game_id` may be a tournament game.

## Done when
- Every id column is constrained or documented; migration + tests.
