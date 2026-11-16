# F401 — Installable PWA + sticky install banner on home
**Status:** ✅ DONE 2026-11-16 — user tested on device; merged dev ac759fa
**Area:** client/manifest.webmanifest, client/sw.js, client/offline.html, client/js/pwa-install.js, client/css/pwa-banner.css, server/config/staticCache.js
**From:** user request 2026-11-16 ("Build App … notify user to download app at home page as sticky")   **Depends:** —

## Scope
1. PWA only (user chose it over APK/desktop installers): manifest, PNG icons, minimal service worker + offline page.
2. Sticky banner on `index.html`: native install prompt (Chromium/Android), Share → Add to Home Screen hint (iOS Safari/Chrome/Edge/Firefox ≥16.4).
3. Hidden when standalone or dismissed ≤14 days.
## Don't
- No APK / Electron. The service worker caches nothing but `offline.html`.
## Traps
- `sw.js` and the manifest have fixed URLs (no `?v=`): they must be `no-cache`, not the year-long immutable default.
- iOS has no `beforeinstallprompt`; in-app webviews (FB/Instagram/Line/Zalo) can't Add to Home Screen → no banner.
