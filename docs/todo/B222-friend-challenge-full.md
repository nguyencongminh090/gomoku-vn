# B222 — Friend challenge: pick friend, full rules modal, series, Swap Elo
**Status:** OPEN
**Area:** server/managers/ChallengeService.js, challenges API route, rating code, client/js/profile.js (`challengeControls`), client/js/social.js, client/js/lobby.js (form reuse), notifications, i18n
**From:** user 2026-10-12 + decisions via AskUserQuestion; design in `features/friend-challenge/`   **Depends:** —

## Problem
Challenge = rule × clock × rated, single game, no friend picker, no series, no stake.
## Scope (ship in 3 steps, each its own commit)
1. **Friend picker → settings modal.** "Thách đấu bạn bè" lists ALL friends (search, online first; offline allowed, TTL applies); from a profile card the friend is preselected. Modal has create-room parity: board size, rule, WALL/portal/Swap2, timer, rated/friendly. `send` validates every field like `RoomManager` create.
2. **Number of games (series).** One room for the whole series, colours alternate, normal Elo applies ONCE at series end. Reuse `features/tournament-match-series` logic.
3. **Swap Elo stake.** Loser and winner exchange the full rating (rank follows) of the played category only. Challenged sees the stake in the incoming row and must accept it. Atomic DB transaction + log row.
## Don't
- Don't swap all categories. Don't allow stake on friendly games. Don't apply swap per game.
## Traps
- Abuse guards (all required): rated games only; per-pair cooldown (24 h); both players ≥ min rated games (value in config, start 20).
- Forfeit/disconnect mid-series: winner = most games won; tie → no swap. (APPROVED by user 2026-10-12)
- `pending` is in-memory: pending challenges (incl. stake) are lost on restart — ACCEPTED by user 2026-10-12, no persistence.
## Why this way
Decisions: full swap, per-category, one room, Elo at end, offline friends challengeable (user, 2026-10-12).
## Done when
- Backend tests (validation, series result, swap atomicity, cooldown, min-games, rated-only) + jsdom (picker, modal) + real-browser pass.
