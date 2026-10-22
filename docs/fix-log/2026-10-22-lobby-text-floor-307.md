# 2026-10-22 12:12 — #307 lobby text under the floor: create-room modal 10.5px / 11.5px
## Prompt
"Fix #307" (ui-audit F2: lobby text 11–14px, wanted 14px). Conflict with tokens.css (lobby typography round, floor --text-xs = 12px) → user chose "keep 12px, fix only the exceptions".
## Root cause
108bd32 raised only `calc(10–13px * --fs-scale)` in platform.css. Remaining sub-12 text: `lobby.css:1081` .setting-label 10.5px and `:1111` .mode-card__desc 11.5px (create-room modal). The other ~60 sub-14px nodes are --text-xs (12px) by design.
## Fix
lobby.css: both literals → `var(--text-xs)`. tokens.css comment records the 12px floor decision. cache-bust --write. Branch fix/307-lobby-text-floor (off dev). #307 stays DONE, with the floor changed from 14px to 12px.
## Verification
New `client/tests/lobby-text-floor.test.js` (no font-size literal <12px in 6 lobby/platform CSS files except .pav/.pbell__badge): 1 of 6 fails without the fix, 6/6 pass with it. Real browser 375px (own DB): .setting-label 12px, .mode-card__desc 12px; only .pav 11px (named exception) is below 12. Not verified: screenshots of the create-room modal; light/dark review.
