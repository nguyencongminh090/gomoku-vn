# F502 — Replay page redesign (mockup A, modern widgets)
**Status:** DONE 2026-11-27 — merged to `dev` from `ui/replay-panel`
**Area:** client/replay.html, client/js/replay.js, new client/js/replay-core.js, new client/css/replay.css, phosphor sprite, i18n
**From:** features/replay-redesign (planning §1–§5, mockups/a.html, shots/A-*)   **Depends:** — (#499 coords: fix separately or first)

## Scope
1. Branch `ui/replay-panel` off `dev`. Body `.pl`; desktop 100svh frame: board | panel (back, player card, timeline, dock, speed+share, list head + analysis switch, 2-col list with think times, delete+report row).
2. Phone (≤860): DOM order = players → board → timeline+dock → move strip → info, list, report (no CSS `order`).
3. `replay-core.js` (UMD): `moveTimes`, `parseMoveParam`, `buildShareUrl` — logic prototyped in mockups/mock.js.
4. No win-line highlight (user 2026-11-27: the winning rule is not stored). `winLine: null`; revisit with #501.
5. Times: hidden if any move lacks a numeric timestamp; move 1 "—"; duration = ended_at − started_at.
6. Deep link `?move=N` (keeps `source=tournament`), `history.replaceState` on nav; share copies link (this move / start).
7. Speed pseg 0.5×/1×/2× = 1200/600/300 ms, remembered `gvn_replay_speed`.
8. Sprite +skip-back, skip-forward, pause, link, git-branch (Regular, paths in mockups/extra-icons.js). Drop ph-bold.
9. Load error → inline pnote (no alert). Back button gets an accessible name.
## Don't
- Touch server/, board.js, game.css board rules. No eval/quality labels. No avatar/rating (#500), no rule chip (#501).
## Traps
- Keep: tournament back path, report form gating (replay-report.js reads #replay-black/white text — update selectors), analysis pref `gvn_replay_analysis`, keys ←→ Home End Space Esc A Delete, langchange re-render.
- board.js fills parent only when parent height > 40 → board host needs a definite height.
- Escape names (escape-utils) — mockup uses innerHTML with fixture names.
- Mockup list labels use board letters; MoveTree skips I (#499).
## Done when
- jsdom: move list, slider+speed, keys, deep link, no win line, tournament path.
- shoot.js on the real page: ≥80% at 1366/1920, no scroll; 375 board+controls visible; 768 no overlap; 0 console errors; axe 0 critical/serious.
- npm test, cache-bust OK, real-browser pass per playwright-e2e-safety.
## Result 2026-11-27
- Win line removed after review (item 4); test counts below predate that.
- jsdom `client/tests/replay-page.test.js` (28), node `server/tests/replay-core.test.js` (46); npm test green.
- Real page (shoot.js copy, fixture game): 1366 673px 95%, 1920 991px 97%, no scroll; 768 708px; 375 366px,
  controls above the tab bar; 0 console errors; axe 0 critical/serious (dark + light).
- Deviations: list labels = MoveTree `shortLabel` (one label source), so it still skips I until #499.
  Share has no toggle: it copies the move on the board (branch point on a variation), move 0 → the game.
  Duration chip uses the existing `timer` icon (no `clock` added). Board click keeps board.js's 2-tap confirm.
- Member view: open report form fits the desktop frame (foot row scrolls; list hidden while open), checked 4 sizes.
- Shots: `features/replay-redesign/shots/impl-*.png`, `measure-impl.json`.
- Deleted after merge (user decision 2026-11-27): `client/css/history.css`, `client/js/tree-view.js`.
- User answers 2026-11-27: (a) share without a this-move/start toggle is OK; (b) #499: do not skip "I"
  (list follows the board) — whether it lands before the merge is not stated; (c) deleting `history.css` /
  `tree-view.js`: needs more discussion, do not delete. Uncommitted on `ui/replay-panel`.
