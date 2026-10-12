# Friend challenge (Thách đấu bạn bè) — User story

Status: **recorded 2026-10-12**, not authorized to build. See [planning.md](planning.md).

## Current state (verified in code)
- `client/js/profile.js` `challengeControls`: inline form on a profile = rule (3) × clock (4 presets) × rated checkbox.
- `server/managers/ChallengeService.js` `send/accept`: in-memory pending challenge (TTL), `accept` seats both in ONE room via `seatPair`. Single game only; no board size / WALL / portal / swap2; no series; no stake.
- Gap vs room create modal (`client/js/lobby.js` `readFormSettings`): board size, ruleWall, rulePortal, ruleSwap2, timer mode/seconds/increment.

## Actors
Challenger, Challenged (friend), server (ChallengeService + rating).

## Stories
0. **Pick the friend first**: "Thách đấu bạn bè" opens a friend picker (from the friends list, searchable, online friends first); choosing one continues to the settings modal. Entry from a profile card pre-selects that friend and skips the picker.
1. As challenger, after choosing the friend, I see a **modal** (from profile card / friends list) and pick the same rules as create-room: board size, winning rule, WALL/portal/Swap2, timer, rated/friendly.
2. I pick **number of games** (series: Bo1 / Bo3 / Bo5 ...) — reuse the tournament match-series logic ([../tournament-match-series](../tournament-match-series/user_story.md)) where possible.
3. I pick a **stake mode "Swap Elo"**: the loser of the series swaps rating/rank with the winner.
4. Challenged sees all settings (incl. stake) in the notification/incoming row before accepting.

## Rules / hard constraints
- Swap semantics (who swaps, when) are undecided — planning Q1; both sides must explicitly accept the stake.
- Guests excluded (members only, as today). Privacy gate `challenge` still applies.
- Rating change must be atomic, logged, and abuse-resistant (see planning Q3).
