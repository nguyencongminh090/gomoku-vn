# Learn (R7) — planning
Status: **open questions; not authorization to implement.** Size L → split into slices below, each its own todo + branch.

## Existing pieces
- Replay viewer + move tree: `client/js/history.js`, `move-tree.js`, `tree-view.js`, `history.html` (old shell until R1 restyle).
- Data: `games.moves` JSON `{x,y,color,timestamp}`; `GET /api/games/:id`, list `GET /api/games`.
- Mockup: Arena `data-screen="learn"`: board + rbar, `evalbar`, quality list, share / download PGN.

## Proposed slices (order = recommendation)
| Slice | What | Backend | Needs decision |
|---|---|---|---|
| 7a | `/learn` Arena shell, tab "Xem lại ván" + "Lịch sử ván" folded in; replay controls, move list, placeholder eval bar/labels | none | Q1, Q2 |
| 7b | Openings library tab | table `openings` (+ seed file) | Q3, Q4 |
| 7c | Puzzles tab | table `puzzles`, progress per user | Q3, Q5 |
| 7d | Annotations on own games | table `game_notes` | Q6 |
| 7e | Real eval/quality | engine (external project) | Q7 — later |

## Open questions (recommended default in bold)
1. Replace `/history.html` with `/learn` (redirect old URL) or keep both? **Replace; redirect `/history.html` → `/learn#tab=history`.**
2. Placeholder eval bar: hide until real, or show fake? **Show a neutral 50% bar labelled "sắp có"; no fake numbers.**
3. Content source for openings/puzzles (planning Q5): hand-made seed JSON by the user · generated from rated games · import. **Hand-made seed JSON in repo (`server/data/learn/*.json`) loaded into tables on boot; generation later.**
4. Opening scope: Free-style only, or Caro VN/Standard too? **Free-style + Caro VN, ≤ 20 openings each.**
5. Puzzle format: position + one winning move, or a forcing sequence? **Single winning move first; sequences later.**
6. Annotations: private to the author, or public on shared replays? **Private notes, ≤ 200 chars per move.**
7. Engine timing: R7 ships without it? **Yes (decided 2026-10-09).**
8. Share/PGN buttons: Gomoku has no PGN standard — export what (JSON, `.psq`, link)? **Share link only in 7a.**

## Traps
- Don't touch board/stones rendering; mini boards in lists stay decorative SVG.
- `history.js` is ~600 lines with tree state — move it, don't fork it; keep `history.html` tests green.
- Any new `err.*`/`clubs`-style codes → vi + en i18n + consistency test; `?v=N` bump on client edits.
