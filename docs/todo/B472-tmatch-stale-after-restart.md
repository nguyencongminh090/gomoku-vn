# B472 — Match page keeps the aborted game live after a server restart
**Status:** ✅ FIXED — 2026-11-25, fix-log 2026-11-25-472; client re-subscribes on reconnect, server answer unchanged
**Area:** client/js/tournament-match.js (reconnect / tmatch:subscribe), server TournamentMatchHandler, TournamentManager._hydratePairing
**From:** #467 follow-up verification 2026-11-25   **Depends:** —

## Problem
Restart while a team-board game is InProgress: the server hydrates the pairing to Ready (replay), but
both players' tournament-match pages still show the old game 12 s later — 3 moves, clock ticking,
board clickable, no status banner. Players only find out by going back to the tournament page.

## Scope
1. Root cause: does the client re-subscribe on reconnect, and what does the server answer for a
   pairing that is no longer InProgress?
2. Page should tell the player the game was reset and send them back (or show the check-in state).
3. Test (socket handler + jsdom) and a real-browser restart pass (`verify.cjs e2e2`).

## Don't
- Change the server's replay-on-restart rule (documented in _hydratePairing).
