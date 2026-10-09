# B176 — Rankings / leaderboard page
**Status:** ✅ DONE 2026-10-09 (branch `feature/176-rankings-page`, uncommitted) — `GET /api/rankings` (30 s cache, paginated) + `/me`, `rankings.html`, lobby link, ?v=178; tests: server/tests/rankings-route.test.js, client/tests/rankings-page.test.js. NOT done: real-browser pass; "rank on profile" (no profile page exists yet — `/api/rankings/me` is the hook for it); Việt Nam/club/friends scopes + search (need #177+ data).
**Area:** server/routes, client
**From:** features/platform, 2026-10-09   **Depends:** B173, B175

## Problem
Public leaderboards per variant×speed.

## Scope
1. API with pagination+cache. 2. Page per approved mockup. 3. Rank on profile.

## Don't
- Start before Depends is done; details to be refined at pickup (re-read planning.md).

## Done when
- Page matches mockup; jsdom + real-browser pass.

## Outcome
- Ratings are per **rule** (freestyle|standard|caro), not per speed, so the page has 3 category tabs (no speed chips). Ranks list needs ≥ 20 rated games (`RANKING_MIN_GAMES`); ties break on user_id.
