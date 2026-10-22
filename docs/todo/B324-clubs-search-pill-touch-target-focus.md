# B324 — Club search pill is 33 px tall; focus ring is a square box inside a rounded pill
**Status:** ✅ FIXED 2026-10-22 (real-browser pass 414/375/320 + jsdom; rank-badge wrap case unseen)
**Area:** client/css/platform.css `.psearch` (+ `.psearch input`, line ~113-116), client/clubs.html:28
**From:** ux-audit clubs.html mobile, 2026-10-22 (`.audit/ux-audit-2026-10-22-clubs-mobile.md`, evidence `docs/audits/2026-10-22/clubs-mobile-*`)   **Depends:** —

## Problem
`.psearch` measures 33 px high on mobile (`clubs-mobile-metrics.json` search[0]) vs 44 px for tabs/buttons beside it; `:focus-visible` draws a square outline on the input inside the rounded pill (`clubs-mobile-B13-offline.png`).
## Scope
1. `@media (max-width:860px){ .psearch { min-height:44px } }` (label hit area).
2. Move the ring to the pill: `.psearch:focus-within { outline:2px solid var(--c-ink); outline-offset:2px }` and `.psearch input:focus-visible { outline:0 }`.
3. Check other `.psearch` users (rankings) at 414.
## Don't
- Do not remove the focus indicator (replacement must be visible, `PRI-FOCUS-VISIBLE`).
## Traps
- `.psearch input { outline:0 }` already exists at platform.css:~116: the ring currently comes from `.pl :focus-visible`; keep one source.
## Why this way
Ring on the visible control, size from the existing 44 px rule. Knowledge: none.
## Done when
- `.psearch` ≥ 44 px at ≤860px; focused ring wraps the pill (screenshot).
- `npm test` green; cache-bust OK.
