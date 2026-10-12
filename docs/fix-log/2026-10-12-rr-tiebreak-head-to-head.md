# 2026-10-12 — #245 round-robin final ranks use head-to-head, then wins, then Sonneborn-Berger
## Prompt
"Do #239 240 243 244 242 245 246 (sequencely, commit after each)"
## Root cause
_completeTournament ranked every format by score→Buchholz→SB; in round robin all players share opponents so Buchholz is identical and score ties stayed ties.
## Fix
standings.rankRoundRobinStandings: score, head-to-head points within the score-tied group, real wins (byes excluded), then SB; equal rows share a rank (3-way cycle stays a tie). Used for round_robin only; Swiss rankStandings untouched.
## Verification
Pure tests (H2H, 3-way cycle, wins after drawn H2H, bye not a win) + manager _completeTournament test. npm test before commit. Server-only.
