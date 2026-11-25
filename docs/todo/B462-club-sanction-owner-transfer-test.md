# B462 — #461 follow-up: sanction rank survives owner transfer
**Status:** OPEN
**Area:** server/tests/club-sanction-rank.test.js, server/managers/ClubService.js (moderate, setRole transfer)
**From:** club-platform handoff (memory), user task list 2026-11-25   **Depends:** B461

## Problem
No test covers ownership transfer: owner bans/mutes, transfers ownership (old owner → officer).
`actor_role` stores the issuer's *role* ('owner'), so the old owner should lose the right to lift it.

## Scope
1. Test: owner bans + mutes, transfers to an officer; old owner (officer) gets 403 on unban/unmute; new owner gets 200.
2. Test fails → root cause in `moderate` / transfer path and fix. Passes → keep as guard, no code change.

## Don't
- Hide "Gỡ hạn chế" client-side (separate optional follow-up).

## Done when
- Test kept in `club-sanction-rank.test.js`; `npm test` green.
