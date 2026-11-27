# B489 — Presence consumer: friends + challenge pickers (PS-4)
**Status:** ✅ DONE 2026-11-27 — social.js, challenge-modal.js, home-challenge.js read `st` via `PresenceView.stOfRow/describe` (legacy fields mapped when absent); shared `.pres-dot` CSS (main.css) replaces social `--sc-on/busy/watch` and the home `::after` badge; `activityFromRoom` delegates to presence-core (interrupted = playing); `social.st_*` keys removed; presence-view.js loaded on social/index/profile/club. Tests: social-bell (4 st cases, assertions moved to presence-view states), challenge-modal, friends-route interrupted. Visual check pending #497.
**Area:** server/managers/FriendService.js, client/js/{social,challenge-modal,home-challenge}.js
**From:** features/presence-status (planning §1e R6-R8, Q4), 2026-11-27   **Depends:** #488
## Scope
1. Friends see Playing during an interrupted game, Tournament, Searching, Away (Q4 A).
2. Renderers call presence-view; social.js dot colours move to the tone table.
## Done when
- jsdom tests per renderer; problem 3 (planning §1f) has a regression test.
