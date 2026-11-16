# 2026-11-16 13:10 — #401 Installable PWA + sticky install banner
## Prompt
"Build App (Allow user to download app -> their own device). Notify user to download app at home page as sticky." Chose PWA.
## Root cause
Feature: site had no manifest/service worker, so it was not installable.
## Fix
Manifest + icons (scripts/gen-pwa-icons.js), sw.js (offline page only), pwa-install.js banner, pwa-banner.css; staticCache.js serves sw.js/manifest no-cache. iOS detection widened to Chrome/Edge/Firefox on iOS, webviews excluded. Branch feature/pwa-install, merged dev ac759fa; ?v= via cache-bust.
## Verification
client/tests/pwa-install.test.js (6) + 2 static-cache cases; npm test 4071 green. User tested on device 2026-11-16.
