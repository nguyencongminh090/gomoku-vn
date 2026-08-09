# Fix log entry — 2026-08-09 15:21

## Prompt

Do #90 (TODO.md #90 / instruction.md B90): user reported the tournament
match page sometimes auto-scrolls when clicking the board to make a move
(21" screen, Tournament Room; Tables Room status unconfirmed).

## Action

`client/js/tournament-match.js`'s `updateBoardState()` — called after every
move (`tmatch:moved`), on init (`tmatch:init`), and on display-mode change —
ended with `requestAnimationFrame(() => boardRenderer.resize());`. `resize()`
(`client/js/board.js`) writes `canvas.width`/`height`/`style.width`/`height`
based on a fresh DOM measurement — a layout-affecting change, not just a
repaint. `client/js/game-ui.js`'s equivalent `updateBoardState()` (Tables
Room) never calls `resize()` per move — only on init/`window resize`/turn-bar
visibility toggle. No file in `client/css/` sets `overflow-anchor: none`, so
the browser's default scroll anchoring is active site-wide; it compensates
`scrollTop` when an element's box size changes near/above the viewport,
which is exactly what a per-move canvas resize gives it to react to.

Removed the `requestAnimationFrame(() => boardRenderer.resize())` line from
`updateBoardState()` (kept the rest of the function — `setState()` still
redraws every move, `renderTimers()` unchanged). Left the two legitimate
`resize()` call sites alone: `initBoard()`'s own one-time `requestAnimationFrame`
resize on board creation, and the `window.addEventListener('resize', ...)`
listener. Neither `_computeGeometry()` (board display-mode/board-size
changes) nor initial sizing depend on `updateBoardState()`'s removed call —
`setState()` already recomputes geometry internally when `boardSize`/
`displayMode` change, and `initBoard()` handles first sizing independently.

Bumped the shared cache-busting version `?v=95` → `?v=96` across every
`client/*.html` and `client/js/*.js` occurrence (per CLAUDE.md's cache-bust
rule), since `tournament-match.js` changed. Verified exactly one version
remains via `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup`.

## Decision

Scope kept to exactly the identified root cause: the per-move `resize()`
call. Did not touch `.match-page-header`/layout scaling or port focus mode
from Tables Room — per the standing analysis (`docs/todo/B90-*.md`), those
would only reduce how often the page needs a scrollbar, not remove the
reflow-on-every-click mechanism itself; the instruction file explicitly
calls out not to substitute either as a "fix" for this bug. Did not add
`overflow-anchor: none` anywhere — the instruction guidance is to only add
that as a targeted follow-up if a live-browser repro shows the jump persists
after this change, not as a blind preventative patch.

**Test coverage:** added `client/tests/tournament-match-board-resize.test.js`
(3 cases, jsdom + real `tournament-match.html` fixture, same pattern as the
#88 leave-lock test) asserting `boardRenderer.resize` is called exactly once
(from `initBoard()`) regardless of how many `tmatch:moved` events follow —
confirmed the test fails against the pre-fix code (2 resize calls just from
`tmatch:init` alone, since it invokes both `initBoard()` and
`updateBoardState()`) before applying the fix, then passes after.

**Not verified live in a browser.** Scroll anchoring is a browser-heuristic
behavior that can't be asserted via Jest/jsdom (no real layout/paint) —
per instruction.md B90's guidance, live verification (resize window so the
page needs a scroll bar, play several moves, watch `window.scrollY`) is a
separate manual step, not run as part of this fix. Flagging explicitly
rather than silently claiming the reported symptom is confirmed gone.

## Summary output

- `client/js/tournament-match.js`: `updateBoardState()` no longer calls
  `boardRenderer.resize()`; only `initBoard()` (once, at board creation) and
  the `window resize` listener still do.
- New test: `client/tests/tournament-match-board-resize.test.js` (3 cases) —
  permanent regression guard, confirmed it fails pre-fix / passes post-fix.
- Cache-bust version bumped `?v=95` → `?v=96` (verified single version across
  all matches).
- `npm test`: 42 suites / 980 tests passing (no regressions).
- `docs/todo/B90-*.md` marked done; `TODO.md` #90 line prefixed `✅` in the
  same commit.
- Branch: `fix/tournament-match-resize-scroll-jump`, off `dev` (TODO.md #90's
  tracking entry exists only on `dev` at the time this branch was cut, even
  though the buggy code is identical on `main` — per the git workflow's
  tracking-entry-only-on-dev exception).
