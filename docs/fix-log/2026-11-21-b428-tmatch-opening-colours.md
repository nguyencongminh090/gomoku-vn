# 2026-11-21 11:23 — B428 Tournament match never learned colours after an opening (Swap2 / Renju)
## Prompt
Found while building #427 (user "Continue P2"; advisor review): Renju openings must work in tournaments.
## Root cause
TournamentMatchHandler's `tmatch:swap2_state` emits carried no `players`, and tournament-match.js's handler only merged `swap2` and redrew the opening board. Colours (null during any opening) never reached the page: `myColor` stayed null, the done state kept `interactive: mine && placing` = false, and Renju forbidden marks (need `myColor === 'BLACK'`) never showed. Pre-existing for Swap2 tournaments too.
## Fix
- server/socket/handlers/TournamentMatchHandler.js: both swap2_state emits add `players` (userId, displayName, color).
- client/js/tournament-match.js: swap2_state copies `players`, recomputes `myColor`; `openingPhase === 'play'` → `updateBoardState()` + `renderHeader()` instead of the opening renderer; `tmatch:init` mid-opening also draws the opening step.
- Branch feature/427-renju-openings (with #427); cache-bust --write.
## Verification
- client/tests/tournament-match-opening-colours.test.js (3): init mid-opening draws offers; done state → myColor WHITE, interactive, offers cleared; Black gets forbidden marks.
- server/tests/TournamentMatchHandler.test.js: done swap2_state carries coloured players.
- npm test 4571 green. Not verified: real-browser tournament match (room flow only was driven).
