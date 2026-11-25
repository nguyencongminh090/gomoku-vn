# B463 — club.html loads js/club-policy.js without ?v=
**Status:** ✅ FIXED 2026-11-25 on `fix/club-policy-cache-bust` — fix-log 2026-11-25-463 (club-scripts-versioned test)
**Area:** client/club.html, scripts/cache-bust.js, server/tests/cache-bust.test.js
**From:** club-platform handoff (memory), user task list 2026-11-25   **Depends:** —

## Problem
`<script src="js/club-policy.js">` has no `?v=`; `cache-bust.js` never versions it.

## Scope
1. Find why: missing placeholder in HTML vs. script only rewriting existing `?v=<hex>`.
2. Fix the wrong layer so every client script on club.html has a content hash.
3. Test that fails when a club.html local script has no `?v=`.

## Don't
- Touch other pages' unversioned refs in this item (record them instead).

## Done when
- `node scripts/cache-bust.js` OK; new test red without the fix, green with it.
