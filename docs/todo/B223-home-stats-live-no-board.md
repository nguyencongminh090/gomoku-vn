# B223 — Dashboard: online/stats strip; "live" rows without drawing the board
**Area:** client/js/lobby-home.js, server/routes/home.js, client/index.html, client/css (home), client/js/i18n.js
**From:** user 2026-10-12 — "đang phát trực tiếp không cần vẽ ván đang chơi để tối ưu performance"   **Depends:** —

**Status:** ✅ DONE 2026-10-12 — stats strip + text live rows + poll diff; `?v=306`.

## Problem
Home polls `/api/home`; `renderLive` rebuilds up to 3 `miniBoard()` SVGs (n×2 lines + hundreds of circles) on every poll. Online count lives only in the nav; dashboard looks empty.
## Scope
1. Stats strip at top of `#screen-home`: online, games in progress, players searching (all in-memory, add to `/api/home`).
2. `renderLive`: text row (`prow` style) — names + Elo, rule, time, viewers, move count, "Xem". No `miniBoard`.
3. `liveOf()` drops `stones` (send `moves` count); update `home-route.test.js`.
4. Poll diff: skip DOM rebuild when payload unchanged.
## Don't
- Don't touch board.js / stone rendering. Keep `miniBoard` export only if still used elsewhere, else delete with its CSS.
- No news/about/puzzle card here (B224).
## Done when
- home-route + lobby-home jsdom tests updated; `?v=` bumped; real-browser pass desktop + 390px.

## Result
- `/api/home` adds `stats {online, playing, searching}`; `live[]` sends `moves` (no `stones`); `miniBoard` + `.hmini` CSS deleted (no other users).
- Deviation: no Elo in live rows — room memory holds no ratings; would need a DB read in an in-memory-only route.
- Verified: `npm test` 152 suites / 2891 tests; real-browser (isolated server copy, 1280 + 390): stats, text rows, 0 SVG, no overflow, 0 console errors, unchanged poll keeps the row. Not verified: clicking "Xem" into a live room.
- Follow-ups: realtime push B225, transfer audit B226.
