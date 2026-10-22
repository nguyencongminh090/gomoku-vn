# B317 — axe: `<aside class="hstack">` nested inside another landmark (lobby)
**Status:** ✅ FIXED 2026-10-22 (axe re-run pending)
**Area:** client/index.html:119, any CSS keyed on `aside.hstack` / `.hstack`
**From:** ux-audit lobby mobile L1, 2026-10-22 (axe `landmark-complementary-is-top-level`, moderate)   **Depends:** —

## Problem
axe reports "The null landmark is contained in another landmark" for `aside` on `/index.html`
(`client/index.html:119`, `<aside class="hstack">`). Not a hard-gate failure (Moderate) but screen-reader landmark list is wrong.
## Scope
1. Confirm the `aside` is inside `main`/`nav`/other landmark; change to `<div>` (or `<section aria-label>` if it deserves a landmark).
2. `grep -rn "aside" client/css client/js` for selectors/queries keyed on the tag; update.
3. Re-run axe on `/index.html` at 375px: 0 violations.
## Don't
- Don't restyle; same classes, tag only.
## Why this way
One-tag change. Rejected: moving the element out of its parent (layout risk). Knowledge: none.
## Done when
- axe on lobby home reports no `landmark-complementary-is-top-level`.
- `npm test` green; `node scripts/cache-bust.js --write` then verify OK.
