# B281 — Bare `replaceState('?…')` under <base href="/"> in forum.js and rankings.js
**Status:** ✅ FIXED 2026-10-17 (tests + real-browser pass + fix-log)
**Area:** client/js/forum.js:58, client/js/rankings.js:140 (both pages have <base href="/">)
**From:** #274 scope item 3, 2026-10-17   **Depends:** —

## Problem
Same bug as #274: `'?'+q` resolves to `/?q` → reload lands on the lobby.
## Scope
1. Prefix `location.pathname`; jsdom test per page.
## Don't
- Don't remove <base>.
## Done when
- Reload keeps filters; tests kept; cache-bust --write.
