# Learn (R7) — planning
Status: **direction set by user 2026-10-10; not authorization to implement.** Size L → slices below, each its own todo + branch.

## Decided (user, 2026-10-10, verbatim in Vietnamese)
- **History:** "Lịch sử ván chơi của user -> chuyển vào profile. Trong profile mỗi người sẽ có lịch sử ván chơi của họ. History tổng quát, sau này sẽ làm một site riêng." → per-user game history lives on the profile (todo B202); the global history gets its own site later; **Learn does NOT absorb history** (supersedes the mockup's "Lịch sử ván" tab).
- **Learn = 2 parts:** (1) **puzzles/exercises**, (2) **forum** where people share experience.
- **Puzzles** are classified by **tags** and **level**. The profile later shows puzzles solved + a puzzle level/rating.
- Eval bar + move-quality labels stay placeholder ("sắp có", neutral 50% bar, no fake numbers); engine later from `GomokuBoardSite/`.
- **Puzzle authoring (answered 2026-10-10):** members can submit puzzles too → needs a review/approval queue from day one (moderation shared with R8 Admin).
- **Puzzle answer format (answered 2026-10-10, verbatim):** "coord, coord, coord,... tức là: cho phép ghi một chuỗi. Ngoài ra, có thể cho phép ghi nước cuối cùng (nước cuối của chuỗi). Đáp án do author đưa ra không phải là duy nhất, đáp án user điền chỉ cần khớp với 1 trong các đáp án là tính." → a puzzle has **one or more accepted answers**; each is a coordinate sequence, and an author may mark an answer as **final-move-only** (just the sequence's last move must match). A solver's submission counts if it matches **any** accepted answer.
- **Answer sequence = solver's moves only (answered 2026-10-10):** the opponent's replies are not entered.
- **Answer mode is chosen by the author per puzzle (answered 2026-10-10, verbatim):** "trong task có yêu cầu: chỉ ghi nước cuối: ví dụ: Author chọn: Write the final fork 4x3..." → modes: `sequence` (solver writes the whole line of their moves) and `final_move` (the task asks only for the decisive last move, e.g. "write the final 4x3 fork"). Prompt text is part of the puzzle.
- **Coordinate input supports both (answered 2026-10-10, verbatim):** "chữ (x,y) hoặc số 122,133,..." → letter form and numeric form, both accepted. **Pinned 2026-10-10 (user, verbatim):** "flatten bàn cờ thành dãy số từ 1 -> 255 đối với bàn 15. Và tọa độ chữ là tọa độ theo 2D trục X, Y. H8 -> X = H, Y=8" → numeric = flattened cell index 1..N² (user wrote 255; 15×15 = 225 — treat as 225); letter = column letter + row number. **Superseded by the answer below.**
- **Levels:** fixed ladder (Dễ/Trung bình/Khó/Chuyên gia…). User puzzle level = highest level with ≥ N solved (N to set).
- **Replay** lives on its own page `/replay/<id>` (shareable); profile history rows link to it.
- Openings library: not mentioned → **parked** (re-ask before building).

## Existing pieces
- Replay viewer + move tree: `client/js/history.js`, `move-tree.js`, `tree-view.js`, `history.html` (old shell). Data: `games.moves` JSON; `GET /api/games/:id`, `GET /api/games`.
- Profile page: `client/js/profile.js`, `GET /api/profile/...` (stats, badges #199).
- Mockup: Arena `data-screen="learn"` (tabs there are superseded above).

## Slices (order = recommendation)
| Slice | What | Backend |
|---|---|---|
| B202 | Profile "Lịch sử ván" tab (own + others' public games) + replay entry; `/history.html` retired/redirected | reuse `/api/games` filtered by player |
| 7a | Puzzles: model (position, solution, tags, level), solve UI, per-user progress | `puzzles`, `puzzle_tags`, `puzzle_progress` |
| 7b | Profile: solved count + puzzle level | read from progress |
| 7c | Forum: threads + replies, categories | `forum_threads`, `forum_posts`, moderation hooks (R8 Admin) |
| 7d | Replay restyle + annotations (if still wanted) | optional `game_notes` |
| 7e | Engine eval | external, later |

## Decided 2026-10-10 (answers to the remaining questions)
- **Rule/board per puzzle:** the author picks the rule (Free-style / Standard / Caro VN) — NOT Free-style-only; so the reviewer must validate legality under that rule, and puzzle rows store rule + board size (15×15 first). *(Differs from the recommended default.)*
- **Tags:** fixed admin-managed list (mở ba, tứ ba, VCF, VCT, phòng thủ…), ≤ 3 per puzzle.
- **Level:** author proposes, reviewer sets; user puzzle level = highest level with ≥ **N = 10** solved (constant).
- **Review:** admins review; states pending → approved | rejected; editing an approved puzzle sends it back to pending.
- **Anti-abuse:** ≤ 5 pending puzzles per user; duplicate position (hash) is flagged to the reviewer, not hard-blocked.
- **Forum v1:** categories + threads/replies; guests read-only; plain text only via `DmText.clean` (no markdown/images); staff delete; report button → R8 Admin queue.
- **Reward:** counter + level only — no puzzle rating/XP in v1.

## Open questions
None blocking. Left for the slice todos: exact tag list and level names, forum category list, report-queue shape (with R8), puzzle submission form UX, and which slice goes first (recommended: B202 → puzzles → profile stats → forum).

## Coordinates — DECIDED 2026-10-10 (user, after reading GomokuBoardSite)
- **Numeric = GomokuBoardSite `sequence` order** (`G.coords.sequence(size)`: reading order, each row starts at the next multiple of 10 + 1; size 15 → 1–15, 21–35, 41–55 …; tens digit = row). So the user's examples: `122` = row 7 col 2, `133` = row 7 col 13. (This replaces the earlier "flatten 1..225" wording — a plain row-major 1..225 is NOT used.)
- **Letter = `H8`**: column letter A.. + row number, **row 1 at the bottom** (same as the board's edge labels and GomokuBoardSite). Both forms are accepted in input.
- Implementation: port `GomokuBoardSite/js/coords.js` `label`/`sequence` (pure); store x,y internally; parse both forms case-insensitively. Row-number ↔ y mapping for `sequence`: top-down (row 1 = top), unlike letters (row 1 = bottom) — pin this in tests.

## Coordinates reference (checked 2026-10-10 in `GomokuBoardSite/js/coords.js` + `client/js/board.js:721`)
- **Letter form = same in both projects:** column letter A.. (x, left→right) + row number with **row 1 at the bottom** (`label = LETTERS[x] + (size − y)`, internal y is top-down). `H8` on 15×15 = centre. gomoku-vn's board already draws these edge labels.
- **Numeric forms in GomokuBoardSite** (`settings.coords`, `G.coords.numbers(size, order)`; both accepted by its voice parser): `spiral` (default) — 1 at the centre, spiralling clockwise out to size²; `sequence` — reading order left→right, top→bottom, each row starting at the next multiple of 10 + 1 (size 15: 1–15, 21–35, 41–55 …; tens digit = row). Note neither is plain row-major 1..225.
- The user's example `122,133` fits `sequence` (row 7 cols 2 and 13) as well as plain row-major or spiral — not decisive.
- Reuse note: gomoku-vn can port `coords.js` (52 lines, pure) rather than reinvent; ids stay x,y in the DB.

## Traps
- Board/stones rendering is locked; puzzle boards reuse `board.js`.
- One-live-socket rule: Learn/forum are REST-only (polling if live updates are ever needed).
- Moving history: keep `history.js`/move-tree tests green; redirect `/history.html`.
- New error codes → vi + en i18n; client edits → `?v=N` bump.
