# B241 — Drop/forfeit player + cap on void/replay loops (size L)
**Status:** ✅ DONE 2026-10-12 (backend x3 formats, jsdom, real-browser pass on Swiss). UI follow-up: header actions → single "Quản lý" menu (1a448ec, ?v=338; real-browser + emulated Android/iOS touch).
**Area:** TournamentManager, PairingLifecycle, standings, doubleElim, TournamentHandler, client tournament-detail
**From:** tournament backend review, 2026-10-12 (user: "Open Task (gather all in once)")   **Depends:** —

## Problem
Deadline with no ready player => DoubleNoShow + replay with a fresh deadline, uncapped (DE resets in place). Two absent players loop forever. entry.withdrawn exists in DB/hydrate but nothing sets it.
## Scope
1. Plan in features/tournament-drop-forfeit/planning.md (answer questions first).
2. Replay cap + outcome rule; organizer 'drop player' action; withdrawn handling in 3 formats, standings, bracket, hydrate.
3. Backend tests x3 formats + jsdom + real-browser pass.
## Don't
- Don't build before planning is answered.
## Why this way
Not yet decided — confirm at pickup. docs/knowledge: none.
## Done when
- Tournament with absent players always terminates; dropped player's opponents advance.
