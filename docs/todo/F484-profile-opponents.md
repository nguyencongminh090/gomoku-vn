# F484 — Profile: head-to-head W/L/D per opponent instead of the game list
**Status:** ✅ DONE 2026-11-26 (merged to dev ca995e9a, not pushed): npm test 5111/5111; headless Chromium 1280+390 on a temp DB (toggle, paging, replay, 0 console errors). Trap found: main.css `button:active` scale shrinks a stretched ::after mid-click, so the handler is on the <tr>.
**Area:** server/db/profiles.js, server/routes/profile.js, client/{profile.html,js/profile.js,css/profile.css,js/i18n.js}
**From:** user, 2026-11-26   **Depends:** —

## Problem
User: "replace history games with scores count base on opponent. On click of opponents -> show details games".

## Scope
1. `GET /api/profile/:u` returns `opponents` (first 10) + `opponentTotal` instead of `recent`.
2. `GET /:u/opponents?page=`; `GET /:u/games?vs=<username>|guest=<name>` for one opponent's games.
3. Table Opponent/Win/Loss/Draw; click expands that opponent's games (replay links), 10 per page.

## Don't
- Don't expose user ids; don't change stats tiles, chart, or unfiltered `/games`.

## Traps
- Guest seats have NULL player id: `GROUP BY opp_id` alone merges every guest. Group guests by stored name.
- losses = games - wins - draws (as `getUserGameStats`), so rows sum to the stats tiles.
- Every new path keeps the `hide_history` gate.

## Why this way
Group registered opponents by id, show current display name. Rejected: by stored name (merges same-name
accounts). Rejected: client-side grouping (client only holds one page). Order: most games, then latest.
Knowledge: none specific.

## Done when
- Route + jsdom tests (guest grouping, sum equality, privacy, expand/collapse), real-browser pass.
