# B266 — Load view-specific lobby/room assets only when the view needs them
**Status:** ✅ CLOSED 2026-10-17 — skipped by user: JS lazy-load rejected (startup duty); CSS split (~5 KB br) not worth it. Findings below kept.
**Area:** `client/room.html`, `client/css/lobby.css` (+ `lobby-zen.css`, `room.css` for the moved rules)
**From:** user question after #264, 2026-10-17   **Depends:** #265 (done)

## Findings (code read + Chromium CSS Coverage, 2026-10-17)
- `tournaments.js` (6 KB br): at load emits `tournament:subscribe` + `live_matches:subscribe`, handles
  `tournament:list/_patch`, `live_matches:list`, re-subscribes on reconnect (B228), feeds `setHeroTournamentCount`
  → home hero/widget need it at startup. **Not lazy-able.**
- `private-chat.js` (6.6 KB br): receives `private_message:receive` (title flash, notif), binds `#online-line`
  and Ctrl/⌘-K, tracks `user:status`/`user:disconnected`/`connect`. Closed ≠ idle → DMs would be lost. **Not lazy-able.**
  Only a split (receivers stay, window/modal UI lazy) would work: saves a few KB, high complexity → not worth it.
- `room.html` loads `lobby.css` (32.5 KB raw, ~5.6 KB br). Coverage on a real room (isolated server, own DB,
  1280×900, load + click every visible non-destructive button): **0 % used at load, 7.4 % (2.4 KB) after
  clicks**; used rules = only `.setting-row`, `.setting-label`, `.pill-group*`, `.toggle-*`, `.timer-input*`
  (the room-settings form). `.modal*`, `.btn*`, tournament/lobby rules: unused in room.

## Scope (remaining)
1. Move the ~2.4 KB settings-form block (setting-row … timer-input) out of `lobby.css` into a shared file
   (or `main.css`, which both pages load); drop `lobby.css` from `room.html`. Lobby must look identical.
2. Re-check Coverage on room states not clicked here: game over, spectator, series, rematch, mobile 390 px.
3. Measure: room bytes/requests before/after (expected ≈ −5 KB br, −1 request).

## Don't
- Don't add a bundler; don't split `i18n.js` (user declined 2026-10-17).
- Don't touch the lobby critical path tuned in #263 (`api-early.js`, socket-early).
- Don't lazy-load `tournaments.js` / `private-chat.js` (see Findings).

## Traps
- Coverage only proves "unused in the states I drove"; JS-built DOM (modals, toasts) can use `.modal*`/`.btn*`
  later → grep `client/js/room*.js`/`game-ui.js` for those class names before dropping.
- Any CSS edit under `client/` → `node scripts/cache-bust.js --write`; the moved block keeps one URL (`?v=`).

## Why this way
JS candidates have startup duty, so the win (~12 KB) is not real. CSS split is the only measured, safe saving.
Knowledge: none.

## Done when
- Room has no `lobby.css`; lobby unchanged visually (screenshots); saving recorded in fix-log; `npm test` green.
