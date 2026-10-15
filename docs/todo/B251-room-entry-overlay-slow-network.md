# B251 — Room-entry overlay smooth on slow networks
**Status:** BUILT, browser pass done (Chromium vi+en, Slow 3G, WebKit); unmerged
**Area:** client/css/game.css, client/room.html, client/js/room-socket.js (`hideEntryOverlay`)
**From:** user "check the transition animation for Loading on Slow Network", 2026-10-15   **Depends:** —

## Problem
`#room-entry-overlay` flashed on fast loads (shown at once), cut away with `display:none`, had a
static hourglass and no slow-link hint, a full-screen `backdrop-filter`, and no reduced-motion rule.

## Scope
1. Backdrop opaque at once (hides empty chrome); card delayed 0.5s via CSS (`animation-delay` + `both`), no JS timer.
2. `hideEntryOverlay()`: add `.leaving` (0.15s fade-out), drop `.visible` on `animationend` (300ms fallback).
3. Spinning icon; "slow" hint fades in after 3s, reuses i18n key `conn.lagging` (vi + en exist).
4. Opaque `var(--c-bg)` instead of backdrop blur. 5. `prefers-reduced-motion` rule.

## Don't
- No new i18n keys; don't touch `session.js` lag overlay (`.gvn-lag`, separate mechanism).

## Traps
- Browser pass caught a flash: .leaving during the 0.2s delay jumped to opacity 1; fixed by fading from computed opacity (`--ov-from`) or skipping when ~0.
- Overlay catches clicks during the 0.2s invisible delay (page is empty then; accepted).
- Tests strip CSS comments before asserting "no backdrop-filter".

## Why this way
CSS-only delay avoids a timer/race with `room:joined`. Knowledge: `docs/knowledge/ui-ux/vbase-depth-motion.md` (not re-read).

## Done when
- `npx jest client/tests/room-entry-overlay.test.js` green; `cache-bust.js` prints one value (?v=383).
- Real browser, Slow 3G: fast load no flash; 5s load shows slow hint; reduced-motion respected. — DONE 2026-10-15 (see fix below)
