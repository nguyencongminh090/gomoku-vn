# 2026-10-20 — #307 outcome: one UI face (Nunito), no display font
## Prompt
"Do #307" → mood "warm, handmade, soft serif" → Fraunces built, then tried Fraunces for labels (rejected), 8 sans candidates in a mockup → Mulish → Nunito. Final: "Thay toàn bộ Manrope -> Nunito (có thể bỏ manrope)", "xác nhận ok" after the user checked the pages.
## Decision
Nunito (variable wght 200-1000, SIL OFL, latin + vietnamese, 39.8 KB) for the whole app; Manrope and Fraunces removed (dirs, links, fallbacks, board.js label font). `--font-display` = `--font`. Why not the serif: user judged it "chưa tốt" on small labels, then chose one sans for consistency. Why not Mulish/Manrope: stacked marks (ể) read cramped / fell back.
## Changes
- Quick-match labels (`.qm-lbl`): sentence case 14px/700, no tracking (all-caps 800 read stiff). Section titles `.ph2` 16px/700.
- Wordmark weight 600 (`.pnav__brand`, `.topnav__title`), tracking -0.02em.
- Desktop text size: 403 hard-coded `font-size: Npx` in 14 CSS files → `calc(Npx * var(--fs-scale, 1))`; `--fs-scale` 1.15 at ≥900px (main.css). Not scaled: game.css, diag.css, room.css, room-arena.css (room layout unchecked).
- `unicode-range` of the vietnamese face widened to U+0300-0304, 0306, 031B.
## Verification
Real Chromium, static server, lobby 375/1280 light+dark; scrollWidth == viewport on lobby, rankings, clubs, puzzles, profile, settings, forum; user checked the pages. `npm test` 3391 pass; cache-bust OK. Tests changed: api-early preload (1 font), settings-tabs size regex, compression font path.
## Not verified / known
NFD text (e + U+0302 + U+0309) still drops its marks to the system font in Nunito and Mulish (precomposed text, all UI strings, is fine) — normalise to NFC if user names/chat show it. board.js coordinate labels now Nunito (not looked at). No LCP/CLS measurement. B307 todo file lives on ui/lobby-typography, not updated here.
