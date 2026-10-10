# B201 — R7: Learn = puzzles (tags + levels) + forum
**Status:** OPEN — B202 done, 7a = B203 written; — design decisions complete 2026-10-10 (see `features/learn/planning.md` "Decided"); next: split into slice todos (B202 profile history first, then puzzles 7a, profile stats 7b, forum 7c)
**Area:** client (new learn page, history.js reuse) + server (openings/puzzles/game_notes tables, later)
**From:** features/learn; `features/platform/planning.md` R7; mockup `data-screen="learn"`   **Depends:** B200 (done)

## Problem
User direction 2026-10-10: Learn has 2 parts — puzzles (classified by tag + level; profile later shows solved count + puzzle level) and a forum for sharing experience. History moves to the profile (B202). Eval bar/labels stay "sắp có" placeholders. Openings parked. Decided 2026-10-10: author picks rule per puzzle, fixed tags (≤3), N=10, admin review (edit→re-review), ≤5 pending/user, forum plain-text guests read-only, counter+level only. members submit puzzles (review queue needed), answers = solver-only coordinate sequences, several accepted answers, author picks mode `sequence`|`final_move`, input accepts letter (H8) or flattened-index (1..225) coords, fixed levels, replay at `/replay/<id>`.

## Scope
1. ~~Resolve open questions~~ done 2026-10-10; write one todo per slice from the decided list.
2. One todo + `feature/*` branch per slice (7a puzzles, 7b profile puzzle stats, 7c forum; 7d replay restyle, 7e engine later), `design-workflow` for the UI.

## Added 2026-10-10
- Puzzle authoring needs a board editor (user: "Thêm editor table để author có thể tạo puzzle") — part of slice 7a; see `features/learn/planning.md`.

## Don't
- No code before the questions are answered. No fake eval numbers. Don't touch board/stones or fork `history.js`.

## Traps
- Moving replay out of `history.html` must keep `client/tests` for history green; redirect the old URL.
- One-live-socket rule: Learn stays REST-only.

## Why this way
Slices keep content-free work (7a) first; content slices wait on the content-source decision. Cites: none.

## Done when
- Questions answered, per-slice todos written. (Umbrella item — closes when 7a–7d are done or dropped.)
