# B340 — Explain the "?" on provisional ratings
**Status:** ✅ FIXED 2026-10-23 (branch fix/339-343-profile-polish; jsdom + CSS tests; browser pass done)
**Area:** client/js/profile.js:97, client/js/i18n.js (profile.*, sys.rating_provisional)
**From:** ux-audit of /u/<name> (user screenshot), 2026-10-23   **Depends:** —

## Problem
Rating shows "1038?" with no explanation; first-time users can't tell it means provisional (few games).
## Scope
1. Render the mark as `<abbr title>`/small label using existing `sys.rating_provisional` text (add `profile.provisional_hint` vi+en if needed).
2. Keyboard/touch reachable (not hover-only): visible small "tạm tính" under the number on mobile.
3. jsdom test: provisional card exposes the label; non-provisional does not.
## Don't
- Don't change the provisional threshold or rating maths.
## Traps
- Hover-only title fails on touch.
## Why this way
Reuses existing i18n string; consistent with room system message.
## Done when
- Provisional card shows an accessible explanation; tests green; cache-bust.
