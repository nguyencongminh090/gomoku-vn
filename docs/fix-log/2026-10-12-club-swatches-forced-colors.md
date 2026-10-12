# 2026-10-12 16:40 — Club Manage swatches grey in Firefox, coloured in Chrome
## Prompt
"color is not display in Club" → still grey on desktop; "Firefox not display but Chrome does"
## Root cause
Not the earlier selector bug (bda5e02, already fixed). Firefox had forced colors active (GTK high-contrast / "override page colors"), which repaints `background-color` of buttons to `ButtonFace` (rgb 233,233,237 — the grey in the screenshot). Reproduced with Playwright `forcedColors:'active'` on the real club.html CSS: Firefox 233,233,237 vs 29,78,216 normally. Phone unaffected.
## Fix
platform.css `.pswatch { forced-color-adjust: none }` — the fill is the information. Checked ring still uses border/outline so selection stays visible. Avatars (`.pav`) left alone: they carry initials, grey is acceptable there.
## Verification
Test in clubs-pages.test.js asserts the property. Forced-colors Playwright run before fix only; not re-run in a real Firefox after.
