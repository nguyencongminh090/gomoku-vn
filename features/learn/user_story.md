# Learn (R7) — user stories
Source: `client/platform-arena-mockup.html` `data-screen="learn"` (tabs Xem lại ván · Câu đố · Khai cuộc · Lịch sử ván) + `features/platform/planning.md` R7.
Status: **design only, not authorized to implement** (size L). Planning: [planning.md](planning.md) · [state](diagram/state.md) · [sequence](diagram/uml_diagram/sequence.md).

## Actors
Player (logged in or guest) · Spectator of a finished game · Content curator (user/admin, offline).

## Stories
- As a player I replay any finished game on the Arena-styled page: step back/forward/start/end, move list, result header.
- As a player I see an evaluation bar and per-move quality labels ("hay", "sai lầm"…) — **placeholder** until an engine exists.
- As a player I add short notes to moves of my own games (annotations) — to confirm.
- As a player I open an opening from a library, see it on the board and play through its lines.
- As a player I solve puzzles (position → find the winning move) and see right/wrong.
- As a player I jump from "Lịch sử ván" into replay without a second page (today `/history.html` has its own replay + move tree).

## Rules / constraints
- Reuse, don't rewrite: replay + `MoveTree`/`TreeView` already live in `client/js/history.js` (+ `board.js` renderer — board/stones are locked, see CLAUDE.md `design-workflow`).
- Pages stay socket-less (REST only; one-live-socket rule). Game data: `GET /api/games/:id` (moves JSON).
- Eval bar + move-quality = placeholder (user 2026-10-09); real engine later from `GomokuBoardSite/`.
- Guests may replay public games; saving annotations/puzzle progress needs an account.
- UI work goes through the `design-workflow` skill (mockup exists: Arena).
