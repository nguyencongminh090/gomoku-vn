# B429 — room.html / tournament-match.html load js/renju.js without ?v=
**Status:** OPEN
**Area:** client/room.html, client/tournament-match.html, scripts/cache-bust.js
**From:** found 2026-11-21 while building #427   **Depends:** —

## Problem
`<script src="js/renju.js"></script>` has no `?v=<hash>` in both pages (added by #425 P1). cache-bust.js only rewrites existing `?v=`, and its verify passes. A changed renju.js can be served stale from the immutable cache, so client forbidden marks could disagree with the server.
## Scope
1. Add `?v=00000000` to both tags, run `node scripts/cache-bust.js --write`.
2. Consider making the verify fail on a local `js/*.js` script tag without `?v=`.
## Done when
- Both tags carry the file hash; `node scripts/cache-bust.js` prints OK.
