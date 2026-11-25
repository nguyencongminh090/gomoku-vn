# B460 — Club team tournament UI: create, captain roster & standings
**Status:** OPEN
**Area:** client/index.html, client/js/tournaments.js, client/tournament.html, client/js/tournament-detail.js, client/css/tournament.css, client/js/club.js, client/js/i18n.js
**From:** features/club-platform/planning.md (slice 7b split from B236)   **Depends:** B236

## Problem
With the `team` tournament backend in place (B236), organizers, club captains, and spectators need Vietnamese UI in the locked visual style to create team events, submit rosters, view team standings + individual boards, and see events in "Giải của CLB".

## Scope
1. Add `'team'` format option and board/round inputs (`boardCount`, `teamRounds`) to `#modal-create-tournament` and lobby format filter/cards in `tournaments.js`.
2. Add captain club/member roster selector (with rating-ordered board preview and draft withdrawal) and organizer start action on `tournament.html` (`tournament-detail.js`).
3. Render live/final team standings (shared `#1` on equal totals, board W/D/L) alongside round-grouped individual boards with club tags and Black/White assignments, and show team events in `club.js` (`#cb-tournaments`).
4. Add client jsdom tests, update cache-bust hashes, and capture desktop/mobile Playwright screenshots in `features/club-platform/browser.cjs`.

## Don't
- Do not use joined `A · B · C` strings (`docs/knowledge/ui-ux/ticket-rows.md`) or restyle locked club/tournament components.

## Traps
- Re-run `node scripts/cache-bust.js --write` and verify `OK` after every `client/` edit.
- Recompute live team standings when `tournament:pairings_patch` arrives so board completions reflect immediately without page reload.

## Why this way
Keeping competition UI on `tournament.html` and linking from both clubs' `giải-đấu` channel matches `docs/knowledge/club-community.md` and `features/club-platform/planning.md`.

## Done when
- Team tournament runs end-to-end in browser (`browser.cjs team`), "Giải của CLB" lists it for both clubs, screenshots checked, and full `npm test` passes on `dev`.
