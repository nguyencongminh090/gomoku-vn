# B469 — Team pairing card: black stone dot near-invisible in dark mode
**Status:** ✅ FIXED 2026-11-25 — --c-ink-3 ring on the black dot (fix-log 2026-11-25-469)
**Area:** client/css (.match-stone-dot--black), client/js/tournament-detail.js (pairing card)
**From:** #467 verification screenshots 2026-11-25   **Depends:** B460

## Problem
On team pairing cards the black-colour dot (`.match-stone-dot--black`) is dark on a dark card, so
only the white dot is visible (see `features/club-platform/screenshots/verify/e2e-after-restart-desktop.png`).
Players can't tell at a glance who has black.

## Scope
1. Give the black dot a visible edge (ring/border token) in dark mode; check light mode too.
2. Test for the rule; real-browser shot.

## Done when
- Both dots visible in dark and light mode, desktop + mobile.
