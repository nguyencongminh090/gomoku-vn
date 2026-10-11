# Friend challenge — Planning

Status: **resolved 2026-10-12** → TODO #222 / docs/todo/B222. Answers: full swap per category; cooldown+min games+rated only; one room, Elo at end; all friends listed. Remaining detail (min games value, forfeit rule) is in B222. Resolve with the user, then formalize into `docs/todo/<CODE>` + `TODO.md` line.

## Open questions
1. **Swap Elo semantics.** Loser ↔ winner exchange their full rating values? Or only when the loser is the higher-rated one (a "demotion")? Per category (freestyle/standard/caro) or all?
2. **Rank vs Elo.** User wrote "swap rank"; ranks derive from rating, so swapping ratings = swapping rank. Confirm.
3. **Abuse.** Friends could farm (win/lose deliberately to move rating). Limits: cooldown per pair, max swaps/day, min games played, rated-only categories?
4. **Series.** Bo-N with colour alternation; who decides forfeit mid-series; does each game also change normal Elo, or only the final swap?
5. **Room model.** One room reused across games vs new room per game (ChallengeService currently seats a single room).
6. **Settings parity.** Extract create-room form into a shared component vs second copy in a modal.

7. **Friend picker.** Reuse the online-users / friends list UI (`private-chat.js` modal, `social.js` rows)? Show offline friends (challenge is async, TTL) or online only?

## Sequencing (proposal)
1. Friend picker (step 0) → modal + full rule parity + payload/validation in `ChallengeService.send` (friendly, single game).
2. Number of games (series).
3. Swap Elo stake (needs Q1–Q3 answered; Opus-tier, rating = security-sensitive).

## Touches
`server/managers/ChallengeService.js`, `server/routes` challenges API, `client/js/profile.js`, `client/js/social.js` (incoming rows), notifications text, `client/js/lobby.js` form reuse, rating code, i18n.
