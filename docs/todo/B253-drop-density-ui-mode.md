# B253 — Drop "Display density" (Lite/Default UI mode); keep the good behaviours
**Status:** ✅ DONE 2026-10-16, merged to dev 2c376d1 (?v=384); browser pass 2026-10-16 (Chromium 1280 + 390 px, real server, temp DB): lobby modal, rule tags + tooltip, online-name line, replay analysis memory, host-vs-spectator room settings, seated→Khán giả tab hides, settings page, legacy gvn_ui_mode ignored, 0 console errors. NOT covered: scoreboard with data, phone bottom-sheet tab bar, WebKit.
**Area:** client/js/ui-mode.js, ui-mode-preload.js, lobby.js, room-ui.js, replay.js, settings-panel.js, settings-page.js, i18n.js, css/lobby.css (`.modal--lite`), ~20 client/*.html preload tags
**From:** user 2026-10-16: "Allow drop it out but keep behaviour (good behaviour)"   **Depends:** —

## Problem
One switch (`data-ui-mode` = lite|default) bundles 7 unrelated behaviours; label "density" is wrong
(it changes info/options, not spacing); two code paths to test; state-dependent hiding is unpredictable.

## Scope
1. Create modal (lobby.js ~549/685): keep Quick Match + collapsed "Advanced" for everyone; remove Default flat form; Lite preset reset stays.
2. Guests tab / scoreboard (room-ui.js ~619/680): hide-when-empty becomes the fixed rule.
3. Online-name cut 6/12 (lobby.js ~217): replace with CSS ellipsis by real width.
4. Rule tags (lobby.js ~503) + room settings sentence (room-ui.js ~581): pick the compact form, full detail via tooltip/expand.
5. Replay analysis (replay.js ~102/405): new setting "open analysis on replay" in Game tab (default off), or remember last state.
6. Remove ui-mode.js mode API, preload attr, settings rows, i18n keys `gset.density`/`mode.*`; keep colour-mode/skin parts of those files.
7. Update/remove tests: ui-mode-two-modes, settings-tabs, settings-panel-no-theme-row. Bump `?v=`.

## Don't
- Don't touch colour mode / skin / language stores that share these files.

## Traps
- ui-mode.js/preload also own setColorMode + skin; split, don't delete the file.
- Persisted localStorage mode key: ignore silently, no migration error.

## Why this way
Keeps progressive disclosure (the valuable part), removes the bundled switch. Rejected: rename-only (keeps 2-path test debt); Lite-forever (loses analysis default).

## Done when
- No `getUiMode`/`data-ui-mode` references; `npm test` green; lobby modal + replay + room checked in a real browser.

## Built (deviations from Scope)
- Name cut: fixed 6 names + "and N others" link (CSS ellipsis can't make that link). Replay analysis: remembers last toggle (`gvn_replay_analysis`), no Settings row. Rule tags: "Standard/Custom" + size, full list in tooltip. Room settings: the one-sentence form.
- ui-mode.js kept (colour mode + skin); ui-mode-preload.js deleted + script tags removed. Test ui-mode-two-modes removed; compression test now uses skin-preload.js.
- `npm test` green (3230). NOT verified: real browser (lobby modal, rule tag tooltip, replay toggle memory, room tabs).
