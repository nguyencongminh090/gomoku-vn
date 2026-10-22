# B321 — Club list rows: long description makes one club fill the phone screen
**Status:** ✅ FIXED 2026-10-22 (real-browser pass + jsdom)
**Area:** client/js/clubs.js:30-32 (`row`), client/css/platform.css `.prow__meta` / `.prows--tickets`
**From:** ux-audit clubs.html mobile, 2026-10-22 (`.audit/ux-audit-2026-10-22-clubs-mobile.md`, evidence `docs/audits/2026-10-22/clubs-mobile-*`)   **Depends:** —

## Problem
A 208-char description renders in full: row 239 px at 414 px (`clubs-mobile-metrics.json` rows[0]); at 320 px the first row exceeds the viewport and the policy badge floats mid-card (`clubs-mobile-B11-320.png`).
## Scope
1. Render `c.description` in its own `div.prow__m` (textContent) instead of inside `PlatformShell.meta`.
2. Clamp to 2 lines: `#cl-list .prow__m { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden }`.
3. Check the zen skin (`shell.css` `.prow__m` rules) and the Mine list (`loadMine` has no description).
## Don't
- Do not truncate the description in the DB/API; the club page keeps the full text.
## Traps
- `body.zen-lobby :is(.prow__m …)` sets font-size only; verify the clamp survives skin overrides.
## Why this way
CSS clamp keeps one source of text. Rejected: JS slice (breaks on Vietnamese combining marks, loses full text for screen readers). Knowledge: `docs/knowledge/ui-ux/INDEX.md` (responsive).
## Done when
- Seeded club with 208-char description: row ≤ ~120 px at 414 and 320 (screenshots).
- `npm test` green; cache-bust OK.
