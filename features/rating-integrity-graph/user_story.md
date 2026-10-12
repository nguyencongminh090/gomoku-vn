# Rating integrity (graph-based collusion detection) — User story

Status: **recorded 2026-10-12**, not authorized to build. See [planning.md](planning.md),
[sequence](diagram/uml_diagram/sequence.md), [state](diagram/state.md).

## Problem
Ratings (Glicko-2, `server/managers/RatingService.js`, 1 game = 1 period) can be inflated by playing the
same opponent repeatedly, feeder/sockpuppet accounts that lose on purpose, or closed rings that only
play each other. Nothing in the repo detects this today (only tournament head-to-head tiebreak exists).

## Current state (verified in code)
- Data already there: `games` (black/white player id, winner, `ranked`, ended_at), `rating_history`
  (`rating_before/after` per game). Schema has **no IP/device column** (`server/db/schema.sql`).
- `glicko2()` is pure, no per-game weight; a pair-level limit must sit before it (`rateGame`).
- Rankings are public views over `ratings` (`database.js` ~972+), min games now 1.

## Actors
Player, admin/moderator, nightly job, RatingService.

## Stories
1. As admin I see a list of **suspicious players/pairs/groups** with the reason and the numbers.
2. As the system, I compute from the ranked-game graph (nodes = players, edges = ranked games between a
   pair): opponent diversity (entropy / unique opponents), share of net rating gain from the top
   opponent, win asymmetry within a pair, closed communities (e.g. Louvain).
3. As the system, repeated games inside a short window between the same pair count less (or not at all)
   for rating — decided in planning Q2.
4. As a broad, selective-free player ("plays anyone"), I am not flagged; as a friend rivalry or a club
   pair, I am not punished automatically.

## Rules / hard constraints
- **Flag for human review first**; no automatic punishment (graph shows pattern, not intent — a player who
  avoids strong opponents is protecting rating, not necessarily cheating).
- Thresholds scale with population size (sparse graphs look "closed" early on).
- Club circle / friends relationships are context, not exemptions.
- Any IP/device signal needs a privacy decision first (nothing is stored today).
- Never rewrite rating history silently; any correction is logged (fix-log style) and reversible.
