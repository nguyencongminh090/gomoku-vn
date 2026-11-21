# 2026-11-21 12:08 — #429 renju.js loaded without ?v= cache-bust
## Prompt
User 2026-11-21: "#429 … Sửa ngay" (found while building #427).
## Root cause
#425 added `<script src="js/renju.js">` to room.html and tournament-match.html with no `?v=`. scripts/cache-bust.js only rewrites refs that already carry `?v=`, so its verify passed while js/renju.js (immutable cache) could be served stale after any change.
## Fix
- client/room.html, client/tournament-match.html: tag gets `?v=`, hash written by `node scripts/cache-bust.js --write` (ee70c581).
- Scope 2 (verify fails on any bare local tag) not done: it would also flag js/qrcode-generator.js (room.html) and css/profile.css (profile.html), outside this item.
## Verification
- client/tests/renju-script-versioned.test.js (2): both pages carry js/renju.js?v=<8 hex>; fails on HEAD HTML (no hash).
- node scripts/cache-bust.js → OK.
