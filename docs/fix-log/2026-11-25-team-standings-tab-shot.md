# 2026-11-25 13:36 — untracked Team standings screenshot shows "Cặp đấu" tab highlighted
## Prompt
team-standings-*.png: "Cặp đấu" tab highlighted while the panel shows the standings table. Root cause first.
## Root cause
Not the page. A probe in the real browser right after clicking "Bảng xếp hạng" showed the classes and
aria-selected correct (standings active, panel active), but computed colours still the pre-click ones:
`.sub-tabs__btn` has a 150 ms colour/border-bottom transition. `browser.cjs` waited only for the
standings text (the panel switches instantly via display) and shot at once, so the frame showed the
old tab highlight. 600 ms later the colours were correct.
## Fix
- `features/club-platform/browser.cjs` `shoot()`: `page.screenshot({ animations: 'disabled' })` so
  transitions are finished before every shot (all slices).
- Team slice asserts `aria-selected` is only on `#sub-tab-standings` before the shot.
- App code unchanged.
## Verification
- New jsdom test `switching sub-tabs on a team tournament highlights the tab whose panel is visible`
  (client/tests/tournament-detail-team.test.js): highlight + aria-selected + visible panel agree after
  clicks and after a live pairings_patch/updated re-render.
- `browser.cjs team` pass, refreshed team-standings-desktop/mobile.png show "Bảng xếp hạng" active.
- Real DB md5 unchanged; full `npm test` green.
