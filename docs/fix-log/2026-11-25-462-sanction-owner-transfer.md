# 2026-11-25 14:32 — #462 Sanction rank survives owner transfer (guard test, no code change)
## Prompt
"#461 follow-up: owner-transfer test … If it passes, keep it as a guard and say so; do not change code."
## Root cause
None — behaviour already correct. `club_sanctions.actor_role` stores the issuer's role at issue time
('owner'), and `moderate` compares rank(actor's *current* role) against it; `setRole(…,'owner')`
demotes the old owner to officer in the same transaction, so their rank drops below 'owner'.
## Fix
Test only: `server/tests/club-sanction-rank.test.js` — owner bans + mutes, transfers to an officer;
old owner → 403 on unban/unmute (rows intact), new owner → 200 (rows gone). Fixture owner restored
in `finally`. No code touched. Branch `fix/club-sanction-owner-transfer` off dev.
## Verification
`npx jest server/tests/club-sanction-rank.test.js` 11/11; full `npm test` green before commit.
Not covered: client still shows "Gỡ hạn chế" when the server would refuse (separate follow-up).
