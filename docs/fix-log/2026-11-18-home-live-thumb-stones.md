# 2026-11-18 15:20 — untracked (#419 follow-up) phone Home live-card mini board: stones too big, off the crossing
## Prompt
Screenshot of phone Home "Đang diễn ra": "Bàn cờ render ở đây bị lỗi quân (design quân cờ to hơn bàn). Fix UI."
## Root cause
`.hh-mini--real > .is-b/.is-w` reused the decorative fallback's `--b/--w` (`radial-gradient(circle at 40% 35%, … 48%, transparent 52%)`). Default size is farthest-corner measured from the off-centre point (bottom-right corner, 0.885 cell), so the stone radius was ~0.44 cell: ~0.9 cell wide, centred up-left of the line crossing and clipped square by the cell box.
## Fix
home-hero.css: real-window stones are the cell span itself — `width: 76%; aspect-ratio: 1; place-self: center; border-radius: 50%` with their own centred-highlight gradient; white gets a 0.5px edge. `.is-last` ring now hugs the stone. Decorative fallback (`--b/--w` on `.hh-mini`) untouched. First try used `margin: 12%` → oval (grid resolved vertical % margins differently: 10.98×11.47 px); dropped.
## Verification
New `client/tests/home-live-thumb-stones.test.js` (3 tests; all fail on pre-fix CSS). Chromium 360 px, 9×7 window in a 130 px card: cell 14.44 px, stones 10.98×10.98 px, centred; before/after screenshots compared. cache-bust OK. Real phone not checked.
