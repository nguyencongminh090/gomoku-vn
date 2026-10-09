# 2026-10-09 — #181 a11y: unlabelled checkboxes
## Prompt
"Do #181"
## Root cause
Toggle checkboxes sit in a `<label class="toggle-switch">` that wraps only the slider span; the visible name is a sibling `<span class="toggle-name">`, outside the label → no accessible name (axe `label` Critical).
## Fix
Added the existing i18n text as the name, no restyle/logic change: `index.html` 4 inputs `data-i18n-aria` (rule-wall/portal, t-rule-wall/portal); `room-ui.js` `r-wall`/`r-portal` `aria-label="${t(..)}"`; `settings-panel.js` `toggleRow` sets `aria-label` from row label. `?v=174→175`.
## Verification
New `client/tests/a11y-checkbox-names.test.js` (3 tests); `npm test` 1873/1873; cache-bust OK single v=175. NOT verified: axe re-run in a real browser (Critical = 0) — not done.
