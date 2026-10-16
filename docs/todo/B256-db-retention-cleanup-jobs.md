# B256 — Retention/cleanup jobs for expiring and append-only tables
**Status:** OPEN
**Area:** server/db/database.js, server/managers/SessionManager.js, schema.sql tables below
**From:** DB architecture review 2026-10-16   **Depends:** —

## Problem
`sessions` (expires_at/revoked_at) — unverified whether any job purges them. Append-only: `rating_history`, `club_log`, `club_messages`, `notifications`, `direct_messages` — no retention policy.

## Scope
1. Verify what already purges sessions (grep SessionManager); add hourly `DELETE` of expired/revoked > 7d if missing.
2. Ask user retention per table (notifications read > 30d? club_log? DM?), then implement as one cleanup tick with batched deletes.
3. Tests with seeded old rows.

## Don't
- Don't touch `rating_history` or `games` (rating integrity, replays).
- Don't pick retention numbers for user-visible data without asking.

## Traps
- Deleting sessions must not log out live users (use expires_at/revoked_at only).

## Why this way
Single timer beside walTimer. Notes: `docs/knowledge/db-backup-restore-retention.md` (retention deletes, reclaiming space).

## Done when
- Old rows removed, live rows kept (tests); numbers agreed with user recorded here.
