# 2026-10-16 22:19 — #261 Lobby layout shift (CLS)
## Prompt
"Do #261"
## Root cause
`#pl-shell` is an empty host until platform-shell.js builds the 56 px nav; the whole lobby dashboard (`.ppanel` chips/rows, stats strip, hero title) is also built from `/api/home` / lobby.js after first paint, so every container grew from 0.
## Fix
CSS-only reservations (cause = elements empty at first paint): `#pl-shell{min-height:56px}` (= `.pnav` height); `:empty` min-heights on the qm chip rows/actions and home-* lists (measured filled heights); `.zen-hero__title:empty` 1 line; `#home-stats` ships visible (always present in /api/home) with `:empty` 47 px. ?v=387.
## Verification
Isolated server :3999, guest, cold: CLS desktop 0.235→0, mobile 0.848→0.062 (rest: greeting wraps to 2 lines on 390 px, +27 px; not reserved to avoid blank gap on 1-line names). clubs 0.01/0.02, rankings ≤0.02. `client/tests/lobby-cls-reserve.test.js` pins the rules (layout itself only measurable in browser). `npm test` 3272 pass.
