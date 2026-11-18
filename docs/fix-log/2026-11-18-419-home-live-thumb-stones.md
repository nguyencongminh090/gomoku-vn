# 2026-11-18 10:15 — #419 /api/home live thumbnails with real stones + news list
## Prompt
"Do #419" — F418 phone live cards showed decorative boards; news card showed 1 item.
## Root cause
Not a bug: `liveOf` sent no position (test "never sends stones"), `news` = `NewsService.latest()` (1 row).
## Fix
- `server/routes/home.js` `thumbOf(engine)`: each `live` entry gets `thumb {x, y, cols:9, rows:7, cells, last}` —
  a fixed 9x7 window (holds every stone when the bbox fits, else centred on the last move, clamped to the board),
  `cells` row-major '.'/'b'/'w', ~90 B/game. Full history never sent (todo Don't).
- Push cadence unchanged: `home:live` still fires on game start/end only; the 60 s poll refreshes thumbs.
  Per-move pushes rejected (cost × home subscribers).
- `news` is now an array: `NewsService.recent(2)`; `EMPTY_CONTENT.news = []`.
- Client: `miniBoard(thumb)` → `.hh-mini--real` grid (one span per point, lines from bg, amber ring on last move),
  falls back to the #418 decorative pattern on a missing/odd thumb. `renderNews` lists all items; desktop CSS
  hides the 2nd line (`shell.css`), phone card shows it with a divider (`home-hero.css`).
## Verification
- home-route 2 new thumb tests (bbox centre, empty board, spread game → last move clamped), news.test 2-item order,
  lobby-home 2 new jsdom tests; full `npm test` 4350 pass; cache-bust OK.
- Real browser (isolated :3101, own DB, 3 bot games 10/7/4 moves, 2 seeded news): thumbs 134×104 with 5+5 / 4+3 / 2+2
  stones + 1 last ring each; phone shows 2 news lines, desktop 1; 0 console errors. Real phone not checked.
