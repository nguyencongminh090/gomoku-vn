# 2026-10-09 17:02 — #192 Settings panel unstyled on platform pages
## Prompt
"report: … Settings UI lỗi. (review CSS?)" — gear on rankings/profile/clubs/club opened a raw text list.
## Root cause
Three layers, all from #190 adding `settings-panel.js` to the platform pages:
1. `settings-panel.css` was never linked → `.gset-*` unstyled, panel dumped at page bottom.
2. With it linked before `platform.css`, the reset `.pl :where(button){font:inherit}` has specificity
   (0,1,0) — `:where` zeroes only its argument, `.pl` still counts — equal to `.gset-segment__opt`, and
   loads later → segment text grew to body size.
3. The Arena 5px radius for `.gset-*` lives in `shell.css`, which platform pages don't load → pills.
## Fix
Link `css/settings-panel.css` **after** `platform.css` on the 4 pages; `platform.css` gets
`.pl .gset-btn, .pl .gset-segment, .pl .gset-segment__opt { border-radius: var(--radius) }`. `?v` 188→189.
## Verification
`server/tests/settings-panel-css-link.test.js` (kept): every page loading the JS links the CSS; on platform
pages the CSS comes after `platform.css` — failed 4/8 before the fix, 12/12 after. Screenshot (faked API,
1280×900 + 390×844): panel on rankings/profile matches the lobby panel. Not verified against the real server.
