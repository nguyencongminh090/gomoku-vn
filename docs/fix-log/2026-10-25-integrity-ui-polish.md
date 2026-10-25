# 2026-10-25 17:46 — untracked integrity tab UI polish (found in real-browser pass)
## Prompt
"real-browser pass tab integrity" → "Do it without write TODO" (fix the 3 findings, no todo).
## Root cause
1. `.ri-tools` is `position:absolute; top/right` over the figcaption — on a 390px phone it covered the hint line.
2. `.ri-search` had only `max-width`; no admin rule styles bare inputs (only `.pform input`), so it rendered as the browser default.
3. SVG labels are in user units, so zooming (viewBox) scaled them up → pile-ups; matrix "other" label (~55px wide) centred in a 40px strip is clipped by the SVG edge.
## Fix
`client/css/puzzles.css`: tools `position:static` ≤800px; `.ri-search` styled like `.pform` inputs (+16px on phones, focus ring); label size/stroke × `--ri-k`. `admin-integrity-viz.js`: `applyCam` sets `--ri-k = cam.w/W`; matrix "other" tick shows … when strip <70px.
## Verification
+3 jsdom tests (--ri-k on zoom/reset, CSS rules, matrix ellipsis); `npm test` 3612 pass; cache-bust OK. Real browser (sim DB, :3998): tools static at 390px, search bordered, zoomed labels small, matrix "…" visible, 0 console errors. Not checked: light mode, node drag.
