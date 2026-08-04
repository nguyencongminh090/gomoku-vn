# Fix log entry — 2026-08-03 01:03

## Prompt

User request: default theme should be light, not dark — the pre-first-paint theme-init IIFE in [client/index.html:14-21](client/index.html#L14-L21) fell back to `window.matchMedia('(prefers-color-scheme: dark)')` whenever no `theme` was yet stored in `localStorage`, so any first-time visitor on a device/browser with a dark OS preference landed on the dark theme by default instead of light.

## Action

Changed [client/index.html:14-19](client/index.html#L14-L19): removed the `prefersDark` OS-preference check entirely; `defaultTheme` is now `storedTheme ? storedTheme : 'light'`. A user's own explicit choice (persisted via `setTheme()` in [client/js/settings-panel.js:53](client/js/settings-panel.js#L53)) is still honored and still wins over the new light fallback — only the *no-preference-yet* case changed.

## Decision

Scoped strictly to what was asked (light-not-dark default) — did not touch `setTheme`/`getTheme` or add a settings-panel option, since the request was only about the initial/default value, not the theme feature itself. This file is inline `<script>` markup in an `.html` file, not `client/css/` or `client/js/`, so the repo's `?v=N` cache-bust bump doesn't apply here.

## Summary output

`npm test`: 324/324 passing, unchanged — this is a client-only inline-script change; `client/js/` (and this inline equivalent) has no unit-test infrastructure in this repo, consistent with every other client-side fix in this log, so no new automated test was added. Manually verified by reading the new logic: with `localStorage` empty, `storedTheme` is `null`/falsy so `defaultTheme` resolves to `'light'` regardless of `matchMedia` result; with a prior `theme` value stored, `defaultTheme` still resolves to that stored value first, unchanged from before.
