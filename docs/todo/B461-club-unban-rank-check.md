# B461 — Club unban/unmute ignores who issued the sanction
**Status:** OPEN
**Area:** server/managers/ClubService.js (moderate), server/db/migrations/025_*, server/tests/clubs-*.test.js
**From:** automated push security review of dev 2ac8de39, verified 2026-11-25   **Depends:** B455

## Problem
`moderate()` lifts a sanction when `policy.canModerate(actor, roleOf(target))`. A banned user is
removed from `club_members`, so their role is null (rank 0) and any officer passes. An officer can
undo a ban the owner issued (e.g. owner bans an officer, another officer unbans them). Only on dev, not prod.

## Scope
1. Migration 025 (idempotent): `ALTER TABLE club_sanctions ADD COLUMN actor_role TEXT` (guarded).
2. mute/ban writes `actor_role` = actor's role (also on the ON CONFLICT update).
3. unban/unmute: allowed only if `rank(actor) >= rank(actor_role)`; legacy NULL = 'owner'.
   Keep the existing `canModerate(actor, currentRole)` check for unmute (target still a member).
4. Re-ban/re-mute by an officer must not downgrade an owner-issued sanction: same rank rule on overwrite.
5. Server tests: officer cannot lift owner ban/mute (403); owner can lift officer's; officer can lift
   officer's; legacy NULL row owner-only; bulk request fails atomically on one forbidden target.

## Don't
- Don't change the permission matrix in features/club-platform/planning.md beyond this rule.
- Don't touch client UI except hiding "Gỡ hạn chế" when the server would refuse (optional, server is the gate).

## Traps
- `ClubPolicy.rank` lives in client/js/club-policy.js (shared one source) — reuse it, don't copy ranks.
- Owner transfer: sanctions issued by the old owner stay 'owner'-ranked; only the new owner can lift them.

## Why this way
Storing the issuer's rank mirrors Discord's role hierarchy (can't undo a higher role's action).
Rejected: owner-only unban (blocks officers from fixing their own mistakes).
Knowledge: docs/knowledge/club-community.md; SKILLS_TREE authz-broken-access-control.

## Done when
- New server tests pass; full `npm test` green; fix-log entry; branch `fix/club-unban-rank` off dev.
