# Puzzle area redesign — concepts (task 1 of prompt.md)

Mockups: `mockups/{a,b,c}.html` (built by `mockups/build.py`, views `#list #solve #mine #editor`; serve with
`node features/puzzle-modern/shoot-mockups.js`). Shared widget system in `mockups/mock.css` (buttons primary/tonal/
quiet/danger, field/area/select, segmented, chips, stat, alert ok/err/info, inline field error, empty state), tokens
= replay.css/puzzles.css (`10px/14px`, ease, ring, elev). Shots: `shots/mock-<c>-<view>-<w>x<h>-<mode>.png`.
Measured (`shots/mock-measure.json`): every view 0 text < 4.5:1, 0 targets < 44 px on phone, 0 console errors.

| | A — Puzzle deck | B — Focused stage | C — Training path |
|---|---|---|---|
| /puzzles | header + stats, filter card (seg level/rule, topic chips), card grid with level top stripe | dense rows with level bar + sticky filter rail (selects) | hero "continue", one shelf per level with progress + horizontal cards |
| /puzzle/id | board ~55% + panel: eyebrow, title, fact chips, prompt well, stat tiles, answer | board ~70% + narrow rail, block primary, key/value facts | panel as 3 steps: read → answer → explore |
| /puzzles/mine | status stats + seg filter + row cards | seg with counts + rows | "needs action" first, then active strip |
| /puzzles/new | board + 3 section cards (setup / info / answers) | tool rail \| board \| inspector | board + step tabs in the inspector |

## Data each concept needs (server is out of scope)
- Available today: number, title, prompt, level, rule, size, toMove, tags, author, solved, attemptsLeft, solver total (solve page).
- **Not in the list payload** (would need `server/`): per-card solver count (A, B), the user's solved count / level on /puzzles (A stats, C hero), per-level progress "18 / 24" and "bài 3 trên 19" (C). Without them A/B drop those bits; C loses its core idea.

## Decision
- 2026-11-27: user picked **C — Training path**, to implement in a new session → [#508](../../docs/todo/F508-puzzle-redesign-training-path.md). Data question resolved 2026-11-27: (a) small read-only server change (progress endpoint, position, mine counts).

## Open
- B504 planning/user_story/shots were not found in this folder (only code changes survived).
