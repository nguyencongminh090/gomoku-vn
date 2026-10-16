# B256 — Retention: cap club_log (rest already bounded)
**Status:** OPEN
**Area:** server/managers/ClubService.js (`log()` ~line 78), tests
**From:** DB architecture review 2026-10-16; scope narrowed after code check same day   **Depends:** —

## Problem
Review feared unbounded tables. Checked: sessions are swept at startup + hourly (`index.js:288`, `SessionManager.sweepExpiredSessions`); DMs have 3-day TTL + 500/conversation; notifications capped per user; club chat capped at 200 (`CHAT_KEEP`). Only `club_log` (INSERT at ClubService.js:79) has no cap.

## Decision (2026-10-16, assistant by research, user delegated)
Keep newest 500 rows per club (same as `DM_KEEP`). Keep forever by design: `games`, `rating_history` (rating integrity), `admin_edges`, reports. Revoked sessions stay until their `expires_at` (audit trail, per database.js comment).

## Scope
1. In `log()`: after insert, delete rows of that club with `id <=` the 500th newest (same pattern as club chat/DM cap).
2. Test: 510 inserts → 500 rows, newest kept, other clubs untouched.

## Don't
- Don't add a global cleanup timer; don't touch `rating_history`/`games`.

## Why this way
Per-write cap mirrors existing caps in ClubService/DmService. Notes: `docs/knowledge/db-backup-restore-retention.md` (retention deletes keep the single writer short).

## Done when
- Test above passes; `npm test` green.
