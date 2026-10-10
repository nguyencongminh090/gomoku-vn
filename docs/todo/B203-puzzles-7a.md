# B203 — R7 slice 7a: puzzles (member submissions, board editor, solve, review)
**Status:** OPEN — 7a-1 (server + coords) implemented on `feature/203-puzzles-server`, uncommitted, awaiting review; 7a-2 (solve UI), 7a-3 (editor/mine/review page) not started
**Area:** server (puzzles/puzzle_tags/puzzle_progress, ClubService-style PuzzleService, routes/puzzles.js, users.is_admin) + client (puzzles list, solve page, editor, review page, shared coords module)
**From:** `features/learn/planning.md` "Decided" (user 2026-10-10 incl. "Thêm editor table để author có thể tạo puzzle")   **Depends:** B202 (done), B201

## Problem
Learn = puzzles + forum. Members submit puzzles through a board editor; admins review; members solve approved ones by entering coordinates; profile stats follow in 7b.

## Scope (3 sequential branches off dev, each reviewed + merged separately)
1. **7a-1 server + shared coords.** Tables: `puzzles(id, author_id, title, prompt, rule 'freestyle'|'standard'|'caro', board_size, stones JSON, to_move, mode 'sequence'|'final_move', answers JSON [[{x,y}…]], level, status pending|approved|rejected, position_hash, review_note, created_at, reviewed_at, reviewed_by)`, `puzzle_tags(puzzle_id, tag)`, `puzzle_progress(user_id, puzzle_id, solved_at, attempts)` (inline migration like #199/#200). `users.is_admin` (0/1) + a CLI command in `server/scripts/admin.js` to grant it (R8 builds real roles later). Pure UMD `coords` module (port `GomokuBoardSite/js/coords.js` `label`/`sequence` + `parse()` for `H8` and sequence numbers; row 1 = bottom for letters, top for numbers). API: `POST/PUT /api/puzzles` (author; ≤ 5 pending/user; edit approved → pending), `GET /api/puzzles` (approved; tag/level/rule/page), `GET /api/puzzles/:id` (**no answers** unless author/admin), `POST /api/puzzles/:id/solve {moves}` → `{correct}` (+ progress row), `GET /api/puzzles/mine`, admin `GET /api/puzzles/review`, `POST /:id/review {approve|reject, level, note}`.
2. **7a-2 solve UI.** `/puzzles` (list, tag/level filters), `/puzzle/<id>` (static board via `board.js`, prompt, answer input accepting both coord forms, per-move entry, correct/wrong, next). Nav "Học" → `/puzzles` (fixes the #202 leftover that "Học" lands on the profile).
3. **7a-3 editor + my puzzles + review page.** `/puzzles/new` editor: tools black/white/eraser, side to move, rule/board size, answers (sequence or final-move, several), tags ≤ 3, proposed level, preview, submit; `/puzzles/mine` (status, reject note); `/puzzles/review` (admins; shows duplicates by hash).

## Don't
- No socket (one-live-socket rule). No puzzle rating/XP (counter + level only, 7b shows it). No forum here (7c). No walls/portals in v1 (only the 3 rules).
- Never send `answers` to solvers; compare server-side only.

## Traps
- Decided answer = **solver's moves only**, so the server cannot simulate opponent replies: submit validation is structural (cells in bounds, empty, distinct, position has no existing five, stone counts plausible for `to_move`); correctness of the line is the reviewer's job. In `final_move` mode the start position is the one right before the final move and the solver plays exactly one move.
- Numbers vs letters flip row direction — pin with tests (`H8` = centre of 15×15; `122` = row 7 col 2).
- `BoardRenderer` is locked: editor/solve use its `onCellClick`/`setState` only; check `interactive`/`isMyTurn` gating before relying on clicks.
- Reuse `DmText.clean` for title/prompt; render with `textContent`. Admin-only routes check `is_admin` server-side; hidden UI is not security.
- New error codes → vi + en i18n; client edits → `?v=N` bump.

## Why this way
Three branches keep each reviewable; server first so UI binds to a tested API. Proposed defaults to confirm at 7a-1 start: levels `easy|medium|hard|expert`; tags `three, four_three, vcf, vct, defense, trap`. Cites: none.

## Done when
- Per branch: backend access-matrix tests (guest/member/author/admin; pending/approved/rejected), jsdom tests, real-browser pass (own DB). 7a done when a member can submit, an admin approves, another member solves it.

## 7a-1 notes (2026-10-10)
- `server/managers/PuzzleService.js` + `routes/puzzles.js` (`/api/puzzles`: meta, list, mine, review, submit, get, edit, solve, review decision); tables in `schema.sql`; `users.is_admin` inline migration; CLI `node server/scripts/admin.js set-admin --username=<u> [--off] [--yes]`; UMD `client/js/coords.js` (global `Coords`; `label/number/parse/parseList`).
- Decisions made while building: stones must have black−white = 0 (BLACK to move) or 1 (WHITE to move); no existing five; list/detail never include answers except for author/admin; list omits stones; editing an approved puzzle → pending and clears its progress; guests can read but not solve (progress needs an account); levels `easy|medium|hard|expert`, tags `three|four_three|vcf|vct|defense|trap`.
- Error codes (client i18n comes with 7a-2): PUZZLE_TITLE_INVALID, _PROMPT_INVALID, _RULE_INVALID, _LEVEL_INVALID, _TAGS_INVALID, _STONES_INVALID, _ANSWER_INVALID, _PENDING_LIMIT, _NOT_FOUND, _FORBIDDEN, _NOT_PENDING, _DECISION_INVALID, _MOVES_INVALID.
- Verified: `npm test` 2432 green (+47: coords, route access matrix); real server on own DB via curl (migration, set-admin, submit → approve → list → solve; non-admin review refused). No UI in this slice.
- **User decisions 2026-10-10 (after asking):** board sizes **15, 17, 19, 20** (stored per puzzle; coords parse against the puzzle's size) and **no cap on answer count or answer length** (only the 128 KB request limit and "distinct empty cells" bound them). Replaces my earlier 15-only / 5×20 defaults.
