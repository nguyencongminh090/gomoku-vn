# Fix log entry — 2026-08-01 22:30

## Prompt

Surface 4: room settings tab, guest branch only — Lite replaces the three read-only label/value rows with one plain sentence; Default/Pro unchanged; host branch and "My preferences" untouched in all modes.

## Action

Added `buildSettingsSentence(settings, ruleText)` to [client/js/room-ui.js](client/js/room-ui.js) and a Lite ternary on the guest branch's `roomRows` inside `renderSettings()`. `.settings-summary` style in [client/css/room.css](client/css/room.css); `settings.summary` plus three `settings.timer_*_low` keys (VI + EN) in [client/js/i18n.js](client/js/i18n.js).

## Decision

The sentence is assembled from `t()` templates with `{board}` / `{rules}` / `{timer}` placeholders rather than string-concatenating translated fragments, so VI and EN can order the clauses differently ("luật {rules}" vs "{rules} rules"). Timer phrasing needed its own per-mode keys because the existing `getTimerSettingsText()` output ("60s — Mỗi nước") is a label, not sentence-grammatical. Only the guest branch's `roomRows` changed — the `settingsGroup()` wrapper from fix #2 and `renderLocalSettingsControl()` are shared untouched, so the two-group structure and the personal controls survive identically in every mode.

## Summary output

11 assertions passed. Guest (a real spectator client) in Default and Pro: 3 label/value rows, no sentence, 2 groups, display + click-mode controls present. In Lite: 0 label/value rows and the single sentence "19×19, luật Tiêu chuẩn, 60 giây mỗi nước", with both groups and both personal controls still intact. Switching language to EN re-renders it as "19×19, Standard rules, 60s per move", confirming it goes through i18n. Host branch guard: in all three modes the host still gets the full editable form (9 setting-rows, 2 groups) and never a summary sentence. Screenshot: [docs/screenshots/mode-settings-guest-lite-1280.png](docs/screenshots/mode-settings-guest-lite-1280.png).
