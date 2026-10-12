# B248 — Tournament result views: bracket tree (double elim) + round columns (Swiss)
**Status:** ✅ DONE 2026-10-12 (?v=345, merged to dev)
**Area:** client/js/tournament-detail.js, client/css/tournament.css, client/js/i18n.js, TournamentManager.serialize*
**From:** user, 2026-10-12 ("RR = cross table; Swiss + double elim = branch/tree with player names, Arena style")   **Depends:** #64/#75 (cross table)

## Problem
Standings tab showed a notice for double elim and only a ranked table for Swiss; client had no bracket skeleton or `bracketMatchId`.

## Scope
1. Server: `serializeTournament` adds `bracket` (double_elim), `serializePairing` adds `bracketMatchId`.
2. Client: double-elim tree (Winners/Losers/GF/reset) from the skeleton, unplayed slots "Winner/Loser of match N"; Swiss round columns under the table; champion/runner-up strip from `finalRank`.
3. Cards link to the match page; keyboard focus; hover/focus highlights a player across cards.

## Don't
- Don't touch round-robin cross table or standings math.

## Traps
- Tree alignment relies on equal-height flex slots + `min-height` (without it cards collapse/overlap).
- Match numbers (not engine ids W2M1) are display-only; byes take no number.

## Why this way
Client resolves the skeleton itself (mirror of `doubleElim.resolveBracket`) so no extra socket round-trip. Knowledge notes: none.

## Done when
- jsdom `client/tests/tournament-detail-bracket.test.js`; real-browser pass dark/light/390px on 13-player DE + Swiss.
- Not verified: bracket-reset card, live match, completed champion strip in a browser; Losers-bracket bye clutter left.
