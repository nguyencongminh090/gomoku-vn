# Fix log entry — 2026-08-01 22:30

## Prompt

Surface 3: room right panel — Lite hides the score table until a game has actually finished, and hides the "Khán giả" tab button until a spectator joins; Default/Pro unchanged.

## Action

`renderScoreTable()` in [client/js/room-ui.js](client/js/room-ui.js) gained a Lite branch that additionally requires some win/loss/draw in the `rawSt` data it already reads. `renderUsersList()`'s existing `guests.length === 0` check was extended to also toggle the `.tab-btn[data-tab="tab-users"]` button. Added a `uiMode()` helper and a `uimodechange` listener that re-runs `updateUI()`.

## Decision

Both gates reuse the data each function already had — no new state, no extra server round-trip. The Lite score gate keys off a nonzero result rather than "a game has been played", because the room's own `scoreTable` is the only durable signal available client-side. Hiding a tab risks stranding whoever is standing on it, so the Lite path clicks the chat tab when it hides an active spectators tab. The mode listener re-runs `updateUI()` rather than the individual renderers, since three separate panel surfaces are mode-gated and `updateUI()` is already the single entry point that drives all of them.

## Summary output

9 assertions passed. With two players seated and no game finished: Default and Pro show the score table (2 rows), Lite hides it. Spectators tab visible in Default/Pro, hidden in Lite while no guest has slot `null`. Switching to Lite while parked on the spectators tab moves the user to chat (`chatTabActive: true`) instead of leaving an empty panel. A real third client then joined as a spectator and the tab reappeared in Lite without a reload. Screenshots: [docs/screenshots/mode-room-lite-noscore-1280.png](docs/screenshots/mode-room-lite-noscore-1280.png), [docs/screenshots/mode-room-lite-spectator-1280.png](docs/screenshots/mode-room-lite-spectator-1280.png).
