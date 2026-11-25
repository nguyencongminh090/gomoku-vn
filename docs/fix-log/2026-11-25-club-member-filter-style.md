# 2026-11-25 13:39 — untracked Club thành-viên filter bar used unstyled native controls
## Prompt
moderation-desktop.png: search box, role/sort selects, bulk action select and minutes field on the
thành-viên channel are unstyled native controls. Restyle with existing club/platform classes; nothing else.
## Root cause
#455 added the roster filter row as a bare `.pform__row` outside any `.pform`, so the platform field
rules (`.pform input/select`) never matched; the search was a plain `<input type=search>` instead of
the platform search pill. The bulk form was `.pform` but with no shared control height.
## Fix
- `client/club.html`: search → `.psearch` pill with magnifier icon + placeholder/aria-label (the
  platform form of CL4 `.search`); role/sort wrapped in `.pform > .pform__row`, both inside `.cl-filter`;
  bulk form gets `.cl-filter__bulk`.
- `client/css/club.css`: scoped `.cl-filter*` rules only (flex row, pill fills the row, 44 px control
  height from CL4, number field 110 px). No other selectors touched. Cache-bust rewrote club.html, clubs.html.
## Verification
- New jsdom test `thành-viên filter bar uses the platform form controls (search pill, .pform selects,
  styled bulk row)` in client/tests/clubs-pages.test.js (classes, icon, CSS rules, search still filters).
- `browser.cjs moderation` pass; moderation-desktop/mobile.png checked. Real DB md5 unchanged; full npm test green.
