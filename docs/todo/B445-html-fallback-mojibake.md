# B445 — Mojibake "nhÃ³m" in HTML fallback text
**Status:** ✅ FIXED
**Area:** client/clubs.html, client/club.html, client/index.html (+ any other client/*.html)
**From:** found during features/club-redesign mockups, 2026-11-24   **Depends:** —

## Problem
#375 fixed double-encoded UTF-8 in i18n.js/ClubService/routes, but the static fallback text and
placeholders in HTML still read "nhÃ³m" (clubs.html 5 lines, club.html 8, index.html 1). Visible before
i18n.js runs, with JS off, and to crawlers / screen readers reading the initial DOM.

## Scope
1. Replace every `Ã`/`Â`+continuation sequence in client/*.html with the correct Vietnamese.
2. Extend `client/tests/rankings-i18n-mojibake.test.js` (or a sibling) to scan client/*.html.
3. `node scripts/cache-bust.js --write`.
## Don't
- Touch i18n keys/values (already fixed by #375).
## Traps
- Grep with the same regex as the test: `/[ÃÂ][\u0080-¿]/`.
## Done when
- Test scans HTML and passes; fix-log entry.
