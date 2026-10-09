# B181 — Unlabelled checkboxes (axe Critical) in create-room modal and room settings
**Status:** ✅ DONE 2026-10-09 (branch `fix/a11y-checkbox-names`) — aria-labels + jsdom test; axe re-run in real browser still pending.
**Area:** client/index.html (`#rule-wall`, `#rule-portal`… in `#modal-create`), room settings tab markup in client/room.html / room-ui.js
**From:** B179 axe pass 2026-10-09 (`docs/audits/2026-10-09/arena-axe-result.json`)   **Depends:** —

## Problem
axe `label` Critical on every run, both modes/viewports: create-room modal rule inputs and room-settings `input[type=checkbox]` have no accessible name (no wrapping/`for` label). Screen readers announce unnamed checkboxes. Also: `tournament.html` without `?id=` shows `alert("Thiếu mã giải đấu")` then redirects (low).

## Scope
1. Give each input an associated `<label>` (or `aria-label` from the existing i18n text).
2. Re-run axe on lobby-modal + room-settings; Critical = 0.

## Don't
- No restyle; keep toggle visuals; no logic change.

## Done when
- axe Critical = 0 on both; jsdom assertion that each checkbox has an accessible name.
