# 2026-10-23 14:35 — #331 Puzzle answers replayed by the engine
## Prompt
"Do #331" — answers were never checked as a real win; sequence mode rejected valid alternative lines.
## Root cause
Answers store the solver's moves only (B203 decision), so no opponent replies exist to simulate; validation stayed structural and correctness was the reviewer's guess.
## Fix
Decision (deep-reasoning + advisor): flag, never reject. Only a forcing line is machine-checkable — while each solver move leaves exactly one defending cell, the opponent's reply is that cell (VCF). The defence set is computed (completion points + cells around the would-be five), not assumed: in caro a closed four has two defences (the cell beyond makes the five dead) and is not forcing — caught by advisor review.
- `server/managers/PuzzleVerifier.js`: replays a line with `GameEngine._checkWin` (rule, walls, portals as in real games). Verdict per line: `verified` (five / unstoppable four at step k), `breaks` (`occupied` = lands on the forced block, `opponent_five` = opponent's four left open), `unchecked` (quiet move, line ends on a lone four e.g. 4-3, or 200-step budget per puzzle). Defence/VCT/trap lines are `unchecked`, not flagged.
- `reviewQueue` adds `verification` per puzzle (computed live, no DB column, stored answer format unchanged).
- `solve`: a non-stored line solves when it is `verified` and ends on its winning move (no moves past the win; `final_move` still one move). Kept minimal — B335/B336 also touch `solve`.
- Review tab: verdict after each answer chip, "Đáp án lỗi" row badge + note when any line breaks.
## Verification
`server/tests/puzzle-verifier.test.js` (five, VCF→open four, caro closed four not forcing / caro open four wins, occupied, opponent four ignored/blocked, counter-four from the forced block, quiet/lone four, standard overline, caro blocked, white to move, portal, wall, budget); `puzzles-route.test.js` (queue verdicts, alternative forced wins solve, non-win/past-win/occupied do not); jsdom review verdict + flag. `npm test` 3443 pass. Browser pass (own DB, :3101) 1280 + 390: verdicts, badge, note correct, console clean.
