# B489 — Presence consumer: friends + challenge pickers (PS-4)
**Status:** OPEN
**Area:** server/managers/FriendService.js, client/js/{social,challenge-modal,home-challenge}.js
**From:** features/presence-status (planning §1e R6-R8, Q4), 2026-11-27   **Depends:** #488
## Scope
1. Friends see Playing during an interrupted game, Tournament, Searching, Away (Q4 A).
2. Renderers call presence-view; social.js dot colours move to the tone table.
## Done when
- jsdom tests per renderer; problem 3 (planning §1f) has a regression test.
