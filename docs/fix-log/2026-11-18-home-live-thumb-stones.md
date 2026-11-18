# 2026-11-18 15:20 — untracked (#419 follow-up) phone Home live-card mini board: stones too big, off the crossing
## Prompt
Screenshot of phone Home "Đang diễn ra": "Bàn cờ render ở đây bị lỗi quân (design quân cờ to hơn bàn). Fix UI."
## Root cause
`.hh-mini--real > .is-b/.is-w` reused the decorative fallback's `--b/--w` (`radial-gradient(circle at 40% 35%, … 48%, transparent 52%)`). Default size is farthest-corner measured from the off-centre point (bottom-right corner, 0.885 cell), so the stone radius was ~0.44 cell: ~0.9 cell wide, centred up-left of the line crossing and clipped square by the cell box.
## Fix
home-hero.css: real-window stones are the cell span itself — `width: 76%; aspect-ratio: 1; place-self: center; border-radius: 50%` with their own centred-highlight gradient; white gets a 0.5px edge. `.is-last` ring now hugs the stone. Decorative fallback (`--b/--w` on `.hh-mini`) untouched. First try used `margin: 12%` → oval (grid resolved vertical % margins differently: 10.98×11.47 px); dropped.
## Verification
New `client/tests/home-live-thumb-stones.test.js` (3 tests; all fail on pre-fix CSS). Chromium 360 px, 9×7 window in a 130 px card: cell 14.44 px, stones 10.98×10.98 px, centred; before/after screenshots compared. cache-bust OK. Real phone not checked.

# 2026-11-18 16:10 — round 2: stones and grid still visibly apart (user: "tham khảo index#room")
## Root cause
Round 1 kept two independent layers: the grid lines were background tiles (`100% / var(--cols)` = 14.44 px) and the stones were CSS-grid spans. Each layer snaps its fractional positions to device pixels on its own, so at a 2.6 DPR phone lines and stones drifted by up to ~1 px per cell edge — the same class of bug as round 1, only smaller.
## Fix
`lobby-home.js miniBoard` now draws one SVG like the room board (`board.js _draw`): viewBox `cols*10 × rows*10`, one `<path>` with lines at `i*10+5`, stones `<circle>` at the same centres (r 4.1 = 0.82 cell), the room's stone gradients (per-board ids `hm<N>b/w`), last move = amber ring r 4.7. CSS: `.hh-mini--real` keeps only the wood background + `aspect-ratio: auto` (base `.hh-mini` forces 4/3); strokes use `vector-effect: non-scaling-stroke`.
## Verification
lobby-home.test.js: #419 test updated to the SVG + new test asserting every circle's cx/cy is on a grid-line coordinate; home-live-thumb-stones.test.js rewritten for the CSS side. Real home page (static server, faked /api/home, 360×800 @2.625): both cards drawn, stones on crossings. Real phone not checked.
