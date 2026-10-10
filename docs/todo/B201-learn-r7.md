# B201 — R7: Learn (replay restyle, openings, puzzles, annotations, eval placeholder)
**Status:** OPEN — design only; blocked on `features/learn/planning.md` open questions (asked the user which slice first: "Chỉ viết todo + design", 2026-10-10)
**Area:** client (new learn page, history.js reuse) + server (openings/puzzles/game_notes tables, later)
**From:** features/learn; `features/platform/planning.md` R7; mockup `data-screen="learn"`   **Depends:** B200 (done)

## Problem
Replay lives on the old-shell `/history.html`; Arena mockup has a Learn screen with replay + eval bar, puzzles, openings. No content or engine exists.

## Scope
1. Resolve Q1–Q8 in `features/learn/planning.md` with the user.
2. One todo + `feature/*` branch per slice 7a–7d (7e engine is later), `design-workflow` for the UI.

## Don't
- No code before the questions are answered. No fake eval numbers. Don't touch board/stones or fork `history.js`.

## Traps
- Moving replay out of `history.html` must keep `client/tests` for history green; redirect the old URL.
- One-live-socket rule: Learn stays REST-only.

## Why this way
Slices keep content-free work (7a) first; content slices wait on the content-source decision. Cites: none.

## Done when
- Questions answered, per-slice todos written. (Umbrella item — closes when 7a–7d are done or dropped.)
