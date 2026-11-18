# F419 — /api/home live games: stone positions for thumbnails + news list
**Status:** OPEN
**Area:** server/routes/home.js (liveOf), server/managers/NewsService.js, client/js/lobby-home.js
**From:** F418 design (2026-11-18): template thumbnails show real stones; template news card lists 2 items   **Depends:** F418

## Problem
`liveOf` returns names/moves/viewers but no stones, so F418 thumbnails are decorative; `news` is only the latest item.
## Scope
1. Add a compact stone list (e.g. last N moves or a cropped window) to each `live` entry; mind payload size (polled + pushed by home-feed).
2. Optional: `news` → up to 2 items.
3. Render real mini boards in F418 cards.
## Don't
- Don't send full move history on every poll/push.
## Done when
- home-route tests cover the new fields; thumbnails show the real position.
