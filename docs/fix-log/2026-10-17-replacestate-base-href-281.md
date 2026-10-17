# 2026-10-17 16:53 — #281 forum.js + rankings.js keep their path on filter
## Prompt
Do #280 - 281.
## Root cause
Bare history.replaceState('?…') under <base href="/"> resolves to /?… (same as #274), so a reload landed on the lobby.
## Fix
Prefix location.pathname (forum: no '?' when no filter). cache-bust --write (forum.html, rankings.html).
## Verification
jsdom per page with <base href="/"> (fail on old code, pass now). Real browser: /forum?category=… and /rankings.html?category=standard survive reload. Note /rankings is not a route (SPA fallback → lobby); the page is /rankings.html.
