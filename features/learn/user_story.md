# Learn (R7) — user stories
Source: `client/platform-arena-mockup.html` `data-screen="learn"` (tabs Xem lại ván · Câu đố · Khai cuộc · Lịch sử ván) + `features/platform/planning.md` R7.
Status: **design only, not authorized to implement** (size L). Planning: [planning.md](planning.md) · [state](diagram/state.md) · [sequence](diagram/uml_diagram/sequence.md).

## Actors
Player (logged in or guest) · Spectator of a finished game · Content curator (user/admin, offline).

## Stories (updated 2026-10-10 after user direction — see planning.md "Decided")
- As a player I solve puzzles: see a position, play the winning move, get right/wrong; puzzles are filterable by tag and level.
- As a player I see on my profile how many puzzles I solved and my puzzle level (later).
- As a member I read the forum, start threads and reply to share experience; guests read only.
- As a player I see my own game history on my profile (and others' public ones); opening a game shows the replay (B202).
- Placeholder: replay shows an evaluation bar + move-quality labels marked "sắp có" until an engine exists.
- Parked: openings library, annotations on own games.

## Rules / constraints
- Reuse, don't rewrite: replay + `MoveTree`/`TreeView` live in `client/js/history.js` (+ `board.js` — board/stones are locked). Per-user history moves to the profile (B202); global history = separate site later.
- Pages stay socket-less (REST only; one-live-socket rule). Game data: `GET /api/games/:id` (moves JSON).
- Eval bar + move-quality = placeholder (user 2026-10-09); real engine later from `GomokuBoardSite/`.
- Guests may replay public games and read the forum; puzzle progress, forum posts need an account.
- UI work goes through the `design-workflow` skill (mockup exists: Arena).
