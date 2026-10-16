# B264 — Page weight: split i18n by language, lazy-load profanity, defer room scripts
**Status:** OPEN
**Area:** `client/js/i18n.js`, `profanity-filter.js`, `profanity-classifier-model.js`, `client/room.html`, `client/index.html`
**From:** static size analysis 2026-10-16   **Depends:** #262, #263 (low priority: network, not bytes, is the bottleneck)

## Problem
`i18n.js` is 168 KB raw / 44 KB gzip with `vi` and `en` in one file, loaded on every page. Room loads profanity filter + model
(~90 KB raw) at startup, plus 5 classic sync scripts and 8 blocking stylesheets before the module. Lobby 25 and room 27 requests
(production serves `client/` directly, not `dist/`). Totals: lobby 504 KB raw / 139 KB gzip, room 594 / 171.

## Scope
1. Split translations per language; load only the active one (keep sync fallback for first paint).
2. Lazy-load profanity filter + model until first chat input/receive.
3. Evaluate `defer` for the classic room scripts and merging room CSS (check dependency order).

## Don't
- Don't change translation keys/text or filter behaviour; don't introduce a bundler step.

## Traps
- jsdom tests and server code `require` these files; keep the CommonJS/UMD export shape.
- Language switch must still apply instantly.

## Why this way
Bytes matter less than round trips here, so this is last. Rejected: Vite bundle for production (toolchain change, size L).
Knowledge: none.

## Done when
- Lobby/room transfer reduced by the measured amount (numbers in fix-log); profanity tests + i18n tests green.
