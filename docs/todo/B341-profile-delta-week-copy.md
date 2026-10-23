# B341 — Rating delta copy: "0 tuần này" reads as 0 weeks
**Status:** OPEN
**Area:** client/js/i18n.js:1287 (profile.delta_week), client/js/profile.js:101
**From:** ux-audit of /u/<name> (user screenshot), 2026-10-23   **Depends:** —

## Problem
"{n} tuần này" gives "-4 tuần này" / "0 tuần này" — unit missing, 0 is noise.
## Scope
1. Change copy to "{n} điểm / 7 ngày" (en: "{n} pts / 7d"), vi+en.
2. Hide the line when delta7 === 0.
3. Update jsdom test.
## Don't
- Don't change how delta7 is computed server-side.
## Traps

## Why this way
Copy-only; unit makes sign meaningful.
## Done when
- No "0" line; unit shown; tests green; cache-bust.
