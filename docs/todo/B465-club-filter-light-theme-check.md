# B465 — Verify: club member filter bar in light theme
**Status:** ✅ VERIFIED 2026-11-25 — light theme OK desktop + mobile, no bug
**Area:** client/css (club .cl-filter), thành-viên channel
**From:** club-platform handoff (memory), 2026-11-25   **Depends:** —

## Scope
1. Real-browser pass, light theme, desktop + mobile: filter bar on the thành-viên channel.
2. Record result here. A real bug → own todo, not fixed in this session.

## Done when
- Screenshots checked and result recorded.

## Result (2026-11-25, dev fc980764, `node features/club-platform/verify.cjs light`, temp DB)
- `gvn_mode=light` cookie → `data-mode="light"`. Search pill, role/sort selects, action select, minutes
  input and "Áp dụng" button all light surfaces with dark text (selects bg rgb(244,243,240), ink
  rgb(102,98,90), visible border); 46 px controls; mobile stacks label+control per row, nothing clipped.
- Shots: `features/club-platform/screenshots/verify/light-members-{desktop,mobile}.png`, `light-members-filtered-*.png` (search "hoa").
- Known, out of scope: roster row checkboxes are still native.
