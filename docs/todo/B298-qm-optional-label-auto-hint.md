# B298 — Quick-match: say the chip groups are optional; explain "Tự động" under Thời gian
**Status:** ✅ DONE 2026-10-19 — `<p class="qm-opt">` "Tuỳ chỉnh (không bắt buộc)" above the three groups; `#qm-time-hint` under Thời gian, visible while Auto is chosen (`hidden` toggled in renderQuickMatch, display only: no change to matching, storage, socket payload). Both strings via i18n (qm.optional, qm.time_auto_hint, vi+en). Hint is in the markup (not injected) so first paint does not shift. Both lines 13px --c-ink-2 = 6.23:1 dark / 6.76:1 light. Wording: removing Auto = picking any other time chip (there is no "deselect").
**Area:** client/index.html, client/js/lobby-home.js, client/js/i18n.js, client/css/shell.css
**From:** lobby UI audit round 2 (user, 2026-10-19)   **Depends:** B293, B297

## Problem
Users cannot tell the three chip groups can be skipped, nor what "Tự động" means.
## Scope
1. Optional label. 2. Auto hint, display level only.
## Don't
- No change to match logic / saved prefs; the user said stop and record a todo if it needed that (it did not).
## Traps
- jsdom suite `lobby-home` pins the card's child order — updated with the new nodes.
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-layout-spacing.md (proximity: the hint sits under its group), vbase-typography.md (13px, line-height 1.5 for stacked Vietnamese marks).
## Done when
- Seen at 375/768/1280/1440 dark+light; `npm test` green.
