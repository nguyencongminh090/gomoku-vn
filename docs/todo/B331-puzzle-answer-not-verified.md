# B331 — Puzzle answers are never verified as a real win
**Status:** ✅ FIXED 2026-10-23 — engine replay of forcing lines, flagged in review; see fix-log 2026-10-23-puzzle-answer-verify-331
**Area:** server/managers/PuzzleService.js, (new) engine check at submit/review
**From:** user, 2026-10-23 (puzzle mechanics review)   **Depends:** —

## Problem
Submit validation is structural only; whether the solver line wins is the reviewer's guess. Sequence mode also matches answers exactly, so a valid alternative winning line is marked wrong.

## Scope
1. Decide: engine check at submit, reviewer-side hint, or both (deep-reasoning; size L if an engine is needed).
2. Optionally accept any line that reaches the same win, not only stored lines.
3. Show the reviewer the verification result.

## Don't
- Do not change stored answer format before the design is chosen.

## Done when
- A submitted puzzle whose line does not win is flagged/rejected; tests cover win and non-win lines.

## Reasoning (2026-10-23)
Answers are solver-only, so only a forcing line (VCF: exactly one defending cell per move → reply known; caro closed fours have two, so they don't force) can be proven. Chose **flag, not reject**: a hard reject would block legitimate VCT/trap/defence puzzles, and flagging is reversible. Verdicts `verified|breaks|unchecked` via `GameEngine._checkWin` so rule/walls/portals match real games. Alternative lines accepted only when `verified` and ending on the winning move. Stored format unchanged.
