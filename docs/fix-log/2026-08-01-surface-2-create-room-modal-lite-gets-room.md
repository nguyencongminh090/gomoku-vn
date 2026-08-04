# Fix log entry — 2026-08-01 22:30

## Prompt

Surface 2: create-room modal — Lite gets room name + "Quick match" with everything else behind a closed "Advanced" disclosure; Default unchanged; Pro persists the last submitted settings and offers a one-click "Use last settings".

## Action

[client/index.html](client/index.html) gained `#btn-quick-match`, `#btn-use-last`, `#modal-advanced-toggle` and a `#modal-advanced` wrapper around the 7 existing setting-rows. [client/js/lobby.js](client/js/lobby.js): the old inline confirm handler was split into `readFormSettings()` / `loadLastSettings()` / `saveLastSettings()` / `applySettingsToForm()` / `submitCreate()`, plus `applyModalMode()` and a `DEFAULT_ROOM_SETTINGS` constant; new `gvn_room_last_settings` key. `.modal__quick` / `.modal__advanced*` / `.modal__use-last` styles in [client/css/lobby.css](client/css/lobby.css); three `modal.*` keys (VI + EN) in [client/js/i18n.js](client/js/i18n.js).

## Decision

Every create path now funnels through `submitCreate()`, so the Pro "remember" write happens for Default and Lite submissions too — otherwise a user would have to visit Pro before Lite's Quick match had anything to reuse. Kept the disclosure purely CSS-gated (`.modal--lite`) so Default/Pro render the identical flat form with no JS branch. **Deviation worth noting:** Lite hides the "Create room" confirm while Advanced is collapsed (Quick match is the single action), but the confirm *returns* as soon as Advanced is expanded — otherwise a Lite user who opened Advanced and edited settings would be stranded, since Quick match submits the remembered preset rather than the edited form. `applyModalMode()` also runs on `openModal()` because the use-last affordance depends on whether anything has been remembered yet, which can change between opens.

## Summary output

12 assertions passed. Default: flat form, no quick/advanced/use-last, confirm present. Lite: Quick match + Advanced toggle shown, Advanced collapsed to 0px with confirm hidden; clicking expands it to 618px, reveals the board-size row, restores the confirm, and flips `aria-expanded` to `true`. Pro with nothing remembered hides use-last; after a preset is stored it appears, and clicking it refills every field correctly (19×19 / caro / wall on / blitz / 120s / +5s). Lite Quick match then created a real room whose server-side settings came back as boardSize 19, winningRule caro, timerMode blitz — i.e. it consumed the same remembered preset. Screenshots: [docs/screenshots/mode-modal-lite-1280.png](docs/screenshots/mode-modal-lite-1280.png), [docs/screenshots/mode-modal-pro-1280.png](docs/screenshots/mode-modal-pro-1280.png).
