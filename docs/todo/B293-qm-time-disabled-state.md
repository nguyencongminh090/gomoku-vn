# B293 — Quick-match "Time": when Auto is selected the per-game / per-move rows still look clickable
**Status:** OPEN
**Area:** client/index.html, client/css/shell.css, client/js/lobby-home.js
**From:** lobby UI audit (user, 2026-10-19)   **Depends:** —

## Problem
Audit finding 5. Auto = no clock preference, yet the two groups look active.
## Scope
1. Show the two groups as dimmed/secondary while Auto is selected (still clickable: picking one leaves Auto) OR make that relation explicit with a hint.
2. Decide with the user first: truly disabled would change behaviour.
## Don't
- Do not make chips `disabled` without a decision; matchmaking semantics unchanged.
## Traps
- `.pchip:disabled` already means "searching" (opacity .55) - do not reuse for this.
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-visual-principles.md.
## Done when
- Verified in a real browser at 375/768/1280/1440 and `npm test` green.
