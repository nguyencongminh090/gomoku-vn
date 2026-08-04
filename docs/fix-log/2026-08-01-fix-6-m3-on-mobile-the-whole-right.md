# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #6 (M3): on mobile the whole right panel — including both player slots — sits below a full-viewport-tall board, so seeing who you're playing means scrolling past the board plus ~312px.

## Action

Added a `<div id="players-strip">` to [client/room.html](client/room.html) immediately before `.board-area-shell`, a `renderPlayersStrip()` function in [client/js/room-ui.js](client/js/room-ui.js) called from `updateUI()` next to the existing `renderSlot()` calls, `.players-strip*` styles in [client/css/room.css](client/css/room.css), and a `room.slot_empty` key (VI + EN) in [client/js/i18n.js](client/js/i18n.js). Board/panel stacking order was left untouched.

## Decision

Strip is mobile-only (`display: none` by default, `flex` inside the existing `≤768px` block) because on desktop both slot cards already sit beside the board — a duplicate there would be pure noise. Placed above the board via `order: 0` against `.board-area-shell`'s existing `order: 1`, which reuses the media query's single-column grid instead of restructuring it. It also hides itself once `gameState` exists, since the turn bar directly above the board then carries both names — this keeps the phone's scarcest resource, vertical space, spent only while the information is actually missing. Reuses the existing `.ready-dot` / `.ready-text` classes so ready state reads identically to the slot cards.

## Summary output

Live check at 375px with two seated players in mixed ready states. Strip renders `display: flex`, sits entirely above `.board-area-shell`, and is fully within the first viewport (no scrolling). Both rows are single-line (21px row height = tallest inline child) and show name + ready state: "#1 NeonLamb Chưa sẵn sàng", "#2 WildFly Sẵn sàng". At 1280px the strip computes to `display: none` and the desktop layout is unchanged. After the game starts, the strip stands down (`display: none`) with the turn bar carrying the names. Screenshots: [docs/screenshots/fix6-strip-375.png](docs/screenshots/fix6-strip-375.png), [docs/screenshots/fix6-desktop-1280.png](docs/screenshots/fix6-desktop-1280.png).
