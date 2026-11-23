# 2026-11-24 04:20 — untracked scorecard + crosstable vanish when nobody is seated
## Prompt
"When there is no one on seat, score disappear and crosstable also. I would like to make it always appear."
## Root cause
`RoomStage.renderScores` (introduced in my crosstable change) blanked `#score-hero` when both seat lookups were null, and the narrow-desktop CSS hides `.scorecard:has(#score-hero:empty)`.
## Fix
`room-stage.js`: the `!left && !right` guard removed; hidden only when the room has no finished game, no crosstable and no game in progress (as before). Empty seats render "—", score 0–0. Branch `fix/scorecard-empty-seats`, `?v=` rewritten.
## Verification
New jsdom test (nobody seated → 0–0, two dashes, crosstable kept); room-stage 47 pass. Not verified: real browser. A brand-new room with no game ever still shows the empty line (kept on purpose).
