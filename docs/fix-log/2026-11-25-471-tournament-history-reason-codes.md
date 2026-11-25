# 2026-11-25 17:20 — #471 Tournament games history shows raw reason codes ("won — win")
## Prompt
"Do #468 - 471"
## Root cause
Client maps were keyed by names the engine never writes. `GameEngine` stores `'win'` (five in a row,
:269) and `'agreement'` (draw, :562); `GAME_REASON_KEY` (tournament-detail.js) and `reasonMap`
(replay.js) knew `normal` / `draw_agreement` / `resign` / `timeout` / `board_full`, so unknown codes
fell through as raw text. Replay header (tournament + casual replays) had the same gap.
## Fix
Both maps: `win` → `history.reason_normal`, `agreement` → `history.reason_draw_agreement`; legacy keys kept.
No server change (stored data stays as is). The two maps are still duplicated (not merged; out of scope).
## Verification
New `client/tests/tournament-history-reason.test.js`: games tab rendered from real i18n for every stored
reason in vi + en (no raw code; exact text for win/agreement/timeout/board_full), plus replay.js
`getResultTextFull` body — 4 red before, green after. Real browser `verify.cjs e2e2` (EN): "Trúc Mai won
— Five in a row", "Draw — Agreed draw" (was "— win" / "— agreement"). Full `npm test` green.
