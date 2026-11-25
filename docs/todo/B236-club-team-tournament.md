# B236 — Club-vs-club team tournament backend & schema
**Status:** ✅ DONE 2026-11-25 — migration 024, team pairing/standings engine, captain roster validation, hydration, and full Jest (4904/4904) passed. UI tracked in B460.
**Area:** server/db/migrations, server/db/tournaments.js, server/managers/tournament, server/managers/ClubService.js, server/socket/handlers/TournamentHandler.js
**From:** features/club-team-tournament, features/club-platform/planning.md   **Depends:** #200, B235

## Problem
Clubs cannot compete as teams; `tournaments.format` only allows individual formats (`swiss`, `round_robin`, `double_elim`) and lacks persisted club team rosters or team standings.

## Scope
1. Add `-- rebuild` migration `024_club_team_tournament.sql` widening `tournaments.format` CHECK to include `'team'` and creating `tournament_teams` + `tournament_team_roster` with FKs and child-key indexes.
2. Add captain roster validation in `ClubService` (confirmed club staff only, equal `boardCount`, ordered by category rating DESC with username tie-break) and expose team events to both clubs in `clubTournaments`/`tournamentClubs`.
3. Extend `TournamentManager` and `TournamentHandler` (`tournament:register_team`, `tournament:unregister_team`) to freeze rosters at start, pair boards across rounds with alternating colors, score boards `1 / 0.5 / 0` (including single-board walkovers, shared `#1` on equal totals, unrated), and hydrate across restarts.
4. Add migration tests on pre-024 seeded rows plus unit/socket tests for permission denials, walkovers, ties, and restart hydration.

## Don't
- Do not build a parallel game/clock/reconnect lifecycle; reuse `PairingLifecycle` and `TournamentMatchHandler`.
- Do not rate team tournament games or break equal team point totals artificially.

## Traps
- Migration 011 enforces a `CHECK` on `tournaments.format`; SQLite requires a `-- rebuild` table swap preserving all rows, FKs, and indexes (`docs/knowledge/db-sqlite-migrations-user-version.md`).
- Use `ON DELETE SET NULL` on `tournament_teams.club_id` with snapshot club fields so `deleteClub` never fails FK checks on historical tournaments (`docs/knowledge/db-constraints-check-fk-sqlite.md`).
- Prevent a dual-club user from appearing on both teams' rosters, and keep `DoubleNoShow` replay-cap boards at `0–0` instead of gifting a seed walkover.

## Why this way
Reusing `tournament_players` and `tournament_pairings` gives board games full timers, reconnects, and replays (`docs/knowledge/club-community.md`, `features/club-platform/planning.md`). UI ships separately in B460.

## Done when
- Migration test, permission/walkover/hydration backend tests, and full `npm test` pass and merge to `dev`.
