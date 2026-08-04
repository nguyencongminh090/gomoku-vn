# Fix log entry — 2026-08-01 22:30

## Prompt

Surface 5: history replay — Lite hides `#btn-analysis` and `#tree-panel` entirely; Default unchanged (button visible, analysis starts off); Pro enters the replay with analysis already enabled.

## Action

[client/js/history.js](client/js/history.js) gained a `uiMode()` helper and `applyReplayMode()`; `openReplay()` now calls `applyReplayMode()` and `setAnalysisMode(uiMode() === 'pro')` where it previously hardcoded `setAnalysisMode(false)`; `setAnalysisMode()` itself force-clamps to `false` in Lite; and a `uimodechange` listener re-gates an already-open replay.

## Decision

Pro reuses the existing `setAnalysisMode(true)` path rather than duplicating its board/tree wiring, so entering analysis on load is byte-identical to clicking the button. The clamp inside `setAnalysisMode()` is a second line of defence: `toggleAnalysis()` is also reachable from the keyboard handler, and without it a Lite user could still switch analysis on despite having no button. The live listener re-runs the same `resize()` + `syncBoardToTree()` sequence `toggleAnalysis()` uses, because showing or hiding the tree panel changes the board's width budget.

## Summary output

19 assertions passed. Loaded a real finished game fresh in each mode (mode applied pre-paint by the head script). Default: button visible, analysis off, tree hidden, and clicking still toggles both on. Lite: button hidden, tree hidden, analysis inactive. Pro: button visible and `.active`, tree panel open, with no click performed. Live switching inside an open replay also works without a reload — to Lite drops analysis and both elements, back to Pro re-enables analysis with the tree open. Screenshots: [docs/screenshots/mode-replay-default-1280.png](docs/screenshots/mode-replay-default-1280.png), [docs/screenshots/mode-replay-lite-1280.png](docs/screenshots/mode-replay-lite-1280.png), [docs/screenshots/mode-replay-pro-1280.png](docs/screenshots/mode-replay-pro-1280.png).
