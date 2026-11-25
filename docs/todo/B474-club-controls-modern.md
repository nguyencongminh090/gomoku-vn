# B474 — Club page: old buttons/widgets, all-caps labels, poll button on the chat bar
**Status:** ✅ DONE 2026-11-25 — ui-audit F1-F9 fixed on `ui/club-controls`
**Area:** client/club.html, client/css/club.css, client/js/club.js, client/tests/clubs-pages.test.js, DESIGN.md
**From:** user 2026-11-25 ("Button/...Widget are old design… Use uppercase indiscriminately… cb-poll-new is on chat bar"); `ui-audit-2026-11-25.md`   **Depends:** —

## Problem
Club page (CL4 "Hội quán") still used platform `.pbtn`/`.pchip`/`.psearch` (5px radius, opacity hover),
caps + tracking on Vietnamese labels/table heads/channel groups, a text "Bình chọn" pill first in the
composer, a UA-styled poll dialog, native 13px row checkboxes, and a blank ~50px gap under each chat
message for staff.

## Scope
1. Club-scoped control system in club.css (`.cl-hq .pbtn/--sm/--primary/--danger/[aria-pressed]`, `.pchip`, `.pbadge`, fields, `.psearch`, row checkbox) from CL4 `common.css` `.btn`.
2. Sentence case under `.cl-hq` (form labels, table heads, `.cl-grp`).
3. `#cb-poll-new` → `cl-ib` icon (check-square) between input and Gửi.
4. Poll dialog card; remove-option = icon button. Event "Đã tham gia" = pressed tint, not filled.
5. Chat row actions in one `.cb-chat__acts` cell (hover-revealed on pointer devices).

## Don't
- Edit platform.css: other pages (rankings, profile, settings) keep their caps labels.

## Traps
- `.cl-hq .pbtn` (0,2,0) outranks platform's `.pbtn--*` (0,1,0) and the ≤860px 44px rule → restate each.
- `data-i18n` on an icon button would overwrite the svg → use `data-i18n-aria`/`-title`.
- `.cl-gate__join` lost its 48px to the scoped `.pbtn` → selector now `.cl-hq .cl-gate__join`.

## Follow-up 2026-11-25 ("giao diện vẫn cứng… align chưa hợp lý")
- Tonal buttons/chips (no rings), filled fields + focus ring, label 6px above field, filter row on one bottom edge + bulk panel, event delete → trash icon, compact table actions, empty `output` hidden; motion: panel enter, dialog @starting-style, poll bar @property, hint pop; poll bars glide via WAAPI (buttons are rebuilt); roster rows without a checkbox keep an empty slot. CSS + roster tests added.

## Done when
- jsdom tests (row actions ≤ 3 grid children; poll button order/labels) red on old code, green now; npm test green; dark/light, desktop/phone shots.
