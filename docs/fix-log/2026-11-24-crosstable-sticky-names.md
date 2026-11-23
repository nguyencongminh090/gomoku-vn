# 2026-11-24 04:00 — untracked crosstable sticky name columns
## Prompt
"add sticky name columns to the crosstable"
## Root cause
Not a bug: after horizontal scroll (fix/crosstable-hscroll) the rank and name columns scrolled away, so rows were unidentifiable.
## Fix
`room-arena.css`: `.score-games` columns 1 (rank, 28px) and 2 (name) `position: sticky` at `left: 0` / `28px`, opaque `--c-surface` background. Branch `fix/crosstable-sticky-names`, `?v=` rewritten.
## Verification
room-stage test asserts the two sticky rules (46 pass). Not verified: real browser — sticky offset alignment, background on the highlighted (seated) rows, dark mode.
