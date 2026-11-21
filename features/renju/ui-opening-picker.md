# Opening naming (replaces the 26-pattern picker) — 2026-11-20
Back: [planning](planning.md) · [user_story](user_story.md) · data: [26 coords](../../docs/knowledge/renju-rif-rules.md)

**Decision (user):** no picker. Players open freely; the site *recognises* the opening, like other renju sites. Reason: not a pro-renju site.
- After the first 3 moves (B, W, B), if they match one of the 26 patterns -> label = pattern name ("Chosei", "Kansei"...), else label = **free-open** (tự do / ngẫu nhiên). Label only; never blocks a move.
- Match = Black 1 at centre H8, White 2 inside the 3x3, Black 3 inside the 5x5, compared to the 26 verified coordinates under the 8 board symmetries (dihedral). Anything else -> free-open.
- One shared pure module `client/js/renju-openings.js`: `detectOpening(first3Moves, boardSize)` -> `{ name, group: 'indirect'|'direct', no } | null`; server stores the label with the game (replay/history), client shows it in the room header/history. i18n keys for the 26 names + `opening.free`.
- Open: label for Renju only, or any rule? (proposal: Renju only). Does Yamaguchi/Taraguchi-10 now mean only their *later* steps (offers of N 5th moves / swap rights), or are they dropped in favour of FreeRenju + label? Needs a user answer before P2.
