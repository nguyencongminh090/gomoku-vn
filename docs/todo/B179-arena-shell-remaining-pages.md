# B179 — Arena shell on remaining pages + ux-audit
**Status:** OPEN
**Area:** client/css/shell.css, client/history.html, tournament*.html, oauth-complete.html
**From:** B173 follow-up, 2026-10-09   **Depends:** B173

## Problem
Lobby/room have the Arena top bar; history/tournament/tournament-match still use main.css's floating pill `.topnav` (tokens already apply). No `ux-audit` pass over the new look.

## Scope
1. Extend the shell top bar rules to those pages' `.topnav` markup.
2. `ux-audit` skill on lobby+room dark/light, desktop+mobile; fix findings only.
3. Measure contrast with axe on both modes.

## Don't
- No board/stones changes; no backend.

## Done when
- One top bar everywhere; axe Critical/Serious = 0 in both modes; `?v` bumped, `npm test` green.
