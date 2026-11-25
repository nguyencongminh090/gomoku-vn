# 2026-11-25 13:33 — #461 Club unban/unmute must respect who issued the sanction
## Prompt
Do #461 (security): officer could lift a ban/mute the owner issued. Follow docs/todo/B461 scope.
## Root cause
`ClubService.moderate` only checked `canModerate(actor, roleOf(target))`. A ban deletes the
`club_members` row, so the target's role is null = rank 0 and any officer passed. The sanction row
did not record who issued it, so there was nothing higher-ranked to compare against.
## Fix
- Migration 025: `club_sanctions.actor_role TEXT` (runs once via user_version).
- mute/ban write `actor_role` = actor's role, also on the ON CONFLICT overwrite.
- Before lifting, or overwriting a live sanction (ban, or unexpired mute): require
  `ClubPolicy.rank(actor) >= rank(actor_role || 'owner')`, else 403 `CLUB_FORBIDDEN`.
  Legacy NULL = owner; old-owner sanctions stay owner-ranked after a transfer.
- `rank` added to the `ClubPolicy` exports (one source, no copied ranks). Existing
  `canModerate(actor, currentRole)` check kept. Client UI untouched (server is the gate).
## Verification
- New `server/tests/club-sanction-rank.test.js` (10 tests) red before the fix, green after:
  officer vs owner ban/mute, owner-banned former officer, owner vs officer, officer vs officer,
  legacy NULL row, atomic bulk 403, no downgrade on re-sanction, expired mute overwritable.
- `club-chat-commands`, `db-migrate` suites green; full `npm test` green.
