# B342 — Profile badges: hide redundant lower tier (Top 500 beside Top 10)
**Status:** ✅ FIXED 2026-10-23 (branch fix/339-343-profile-polish; jsdom + CSS tests; browser pass done)
**Area:** client/js/profile.js:62-65, server badge list (badge ids top_500/top_10, wins_100/wins_1000)
**From:** ux-audit of /u/<name> (user screenshot), 2026-10-23   **Depends:** —

## Problem
Both "Top 500" and "Top 10" show together (rank #6/#2); lower tier is redundant, adds clutter.
## Scope
1. Decide tier pairs (top_10>top_500, wins_1000>wins_100); render only highest per pair client-side.
2. Test with badges [top_500, top_10] → one badge.
## Don't
- Don't delete earned badges from DB/API; display filter only.
## Traps
- Other pages showing badges must stay consistent (rule 9) — grep for badge rendering first.
## Why this way
Display-only keeps data intact and reversible.
## Done when
- One badge per tier family on profile; tests green; cache-bust.
