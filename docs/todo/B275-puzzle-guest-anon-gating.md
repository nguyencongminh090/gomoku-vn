# B275 — Guests/visitors see the full editor and action buttons, learn "members only" after submit
**Status:** ✅ DONE 2026-10-17 — see fix-log 2026-10-17-puzzle-guest-gating-275
**Area:** client/js/puzzle-editor.js, client/js/puzzles-mine.js, client/puzzles.html:31-33
**From:** ux-audit puzzle 2026-10-17 (`docs/audits/ux-audit-2026-10-17-puzzle.md`), finding M1 (Medium)   **Depends:** B273

## Problem
Guest/anon see "Đăng puzzle mới", "Puzzle của tôi", the whole editor and an enabled solve form; anon /puzzles/mine also logs a red 401 console error.
## Scope
1. Non-member: show the login message on load (#ed-error / #pz-login) instead of the form; hide the two action buttons.
2. Avoid the anon 401 probe on /api/puzzles/mine (check session first).
## Don't
- Don't redesign the page; reuse existing i18n keys (puzzles.login_needed).
## Done when
- Guest/anon see the prompt without typing; jsdom tests kept; ?v= bumped.
