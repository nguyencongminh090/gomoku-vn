# 2026-10-22 16:30 — #318 create-room modal preselects ranked for guests
## Prompt
DO #318
## Root cause
`openModal()` always applied `LITE_DEFAULT_SETTINGS` (`ranked: true`) and the markup has `#rm-rated checked`, regardless of session. Guests can't play ranked, so the selected card contradicted the outcome.
## Fix
`client/js/lobby.js` `openModal`: `applySettingsToForm({ ...LITE_DEFAULT_SETTINGS, ranked: !userInfo.isGuest })` — runs on every open. Server rules, rated card (still selectable) and the guest hint untouched. As specified in the todo; no deviation.
## Verification
`client/tests/create-room-modal-mode.test.js` +3 (guest → friendly, user → rated, per-open). `npm test` 3412 green; cache-bust OK. No real-browser pass.
