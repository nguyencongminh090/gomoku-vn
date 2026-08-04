# Fix log entry — 2026-08-01 22:30

## Prompt

Phase 2 infrastructure: Lite/Default/Pro UI-mode system — `data-ui-mode` attribute on `<html>`, `gvn_ui_mode` persistence, `uimodechange` event, and the lobby switcher UI (labelled control on desktop, icon + sheet on mobile).

## Action

New [client/js/ui-mode.js](client/js/ui-mode.js) (`getUiMode()` / `setUiMode()` / `initModeSwitcher()`), imported from [client/js/index-entry.js](client/js/index-entry.js). A blocking init IIFE modelled on index.html's theme script was added to the `<head>` of all four pages — [login.html](client/login.html), [index.html](client/index.html), [room.html](client/room.html), [history.html](client/history.html). Switcher markup (`#mode-switch` segmented control + `#mode-toggle` icon) added to index.html's topnav as a sibling of `#theme-toggle`, plus a `#mode-sheet` bottom sheet. `.mode-switch*` / `.mode-sheet*` / `.show-on-mobile` styles in [client/css/main.css](client/css/main.css); seven `mode.*` keys (VI + EN) in [client/js/i18n.js](client/js/i18n.js).

## Decision

The init script is duplicated inline per page rather than imported, because it must run before first paint and the entry points are deferred ES modules — an import would let a Default-mode frame paint first. Deliberately did **not** replicate the existing theme gap (theme is only wired into index.html): every page reads `gvn_ui_mode` independently, since mode-dependent layout must be right on first load everywhere. `setUiMode()` early-returns when the mode is unchanged so no redundant `uimodechange` re-render fires. Switcher lives only in the lobby nav, matching the existing convention that room/history navs carry no theme toggle either. Added a `try/catch` around the `localStorage` read that the theme IIFE lacks — a blocking head script on four pages shouldn't be able to white-screen the app in privacy modes.

## Summary output

Live check, 29 assertions, all passed. Defaults to `default` on all 4 pages with no stored value; a stored `pro` is applied at `domcontentloaded` (pre-paint) on all 4. Desktop: segmented control visible, icon trigger hidden, clicking each of lite/pro/default sets the attribute, writes `gvn_ui_mode`, fires `uimodechange` with the right detail, and moves the `.is-active` state. Mode survives a reload (restored from localStorage, switcher re-synced) and a real lobby→room navigation, and returns intact to the lobby. Mobile 375px: segmented control hidden, icon trigger visible with no inline text, tap opens a 3-option sheet, picking Lite applies + persists + closes the sheet, and the mode holds through a genuine login → lobby → room → history chain. Screenshots: [docs/screenshots/mode-switcher-desktop.png](docs/screenshots/mode-switcher-desktop.png), [docs/screenshots/mode-sheet-375.png](docs/screenshots/mode-sheet-375.png), [docs/screenshots/mode-room-lite-375.png](docs/screenshots/mode-room-lite-375.png).
