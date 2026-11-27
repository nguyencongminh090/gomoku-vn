You are the front-end designer and engineer for gomoku-vn, redesigning the Puzzle (Learn) area and changing how puzzles are created and solved.

<context>
Pages in scope: /puzzles (client/puzzles.html, js/puzzles.js), /puzzle/<id> solver (client/puzzle.html, js/puzzle.js), /puzzles/mine (client/puzzles-mine.html, js/puzzles-mine.js), /puzzles/new editor (client/puzzle-editor.html, js/puzzle-editor.js), styles in client/css/puzzles.css.
The branch ui/puzzle-modern already holds uncommitted work for B504 (Modern Flat 2.0 controls, see docs/todo/B504-puzzle-controls-modern.md and features/puzzle-modern/). Build on it; do not discard or redo it. B505 (promoting shared tokens) stays out of scope.
The reference style for "consistent with other pages" is /replay/<id> (client/css/replay.css, #502) and the Home page (#503).
</context>

<task_2_functions>
Do these first, test-driven, one commit each. They change behaviour, so each needs a kept jsdom test.

A. Editor (/puzzles/new)
1. Remove the single-colour Black and White stone tools and keep only the Auto tool, which alternates colours. Auto must stay in step after erasing, because autoColor() counts stones.
2. Parse the text import field (#ed-import) live as the user types, debounced at about 300 ms, so the board preview updates without pressing the import button. Drop the button if it becomes redundant. When the text is malformed, show a visible inline notice next to the field that names the bad token, for example "i99 không hợp lệ". Use role="alert" and do not use window.alert(), because native dialogs block the page. Keep the last valid board while the text is invalid.
3. Highlight the last placed stone on the editor board, using the same last-move marker the game board uses in BoardRenderer.

B. Solver (/puzzle/<id>)
1. The board is view-only while the puzzle is unsolved and attempts remain. Clicks and taps place nothing, and the answer is entered only through the text input.
2. Remove the "Bỏ nước cuối" button (#pz-undo, i18n key puzzles.undo) and its handler.
3. When the puzzle is solved or attempts run out, unlock the board for free exploration: the user can place stones to study the position, nothing is submitted, and a clear control resets the board to the puzzle position.
</task_2_functions>

<task_1_redesign>
After task 2 is green, redesign all four pages as one coherent area. Use the design-workflow skill, with /ui-brief for the direction and DESIGN.md tokens and /ui-motion for motion. Be inventive: propose two or three distinct concepts as mockups in features/puzzle-modern/ before coding, for example a "puzzle card deck" catalogue, a focused solve stage where the board dominates, or an editor laid out as tool rail, board and inspector. Then implement the one I pick.

Requirements, with the reason behind each:
1. Match the visual language of /replay and Home (radius, elevation, focus ring, colour tokens), so the puzzle area does not feel like a separate app.
2. Use sentence case. Reserve uppercase for at most tiny eyebrow labels, because all-caps text everywhere flattens hierarchy and hurts Vietnamese readability.
3. Never join facts as "A · B · C". Give each fact its own labelled element (chip, stat or row), because dot-joined strings are hard to scan and break on phones.
4. Give each view a clear hierarchy: one primary action per view, a visible title, then supporting meta, then secondary actions.
5. Keep the layout balanced: board and side panel in proportion on desktop, and a stacked layout under 860 px with the board first.
6. Design the widgets as a system: buttons (primary, tonal, quiet, danger), text inputs and textareas, selects, segmented controls, chips, empty states and the error and alert states from task 2. Each needs hover, focus-visible, disabled and pressed states.
Motion: subtle, purposeful transitions only (state changes, solved celebration, board unlock), using tokens, with a prefers-reduced-motion fallback that removes them.
</task_1_redesign>

<constraints>
- Keep every existing ID, data-i18n key, ARIA state and JS hook unless task 2 explicitly removes it, because tests and other scripts depend on them.
- Do not touch server/, client/js/board.js internals, game.css, platform.css .pbtn or admin.html. Extend BoardRenderer through its options only.
- Follow CLAUDE.md: read the todo files first (node scripts/track.js), record task 2 as new todo items before building them, run node scripts/cache-bust.js --write after client edits and verify it prints OK, and do not commit until I say so.
- If a requirement here conflicts with B504's approved mapping, stop and ask me one question with concrete options.
</constraints>

<done_when>
- npm test passes, with new tests covering: no single-colour tools, live parse plus the invalid-input notice, the last-move highlight, the solver board locked before and unlocked after solved or out of attempts, and no undo button.
- A real-browser pass on an isolated temp DB (playwright-e2e-safety) in dark and light themes, on desktop and phone: 0 console errors, text contrast at least 4.5:1, touch targets at least 44 px, a visible focus ring, and no motion under reduced-motion.
- Before and after screenshots of all four pages are in features/puzzle-modern/shots/.
</done_when>

<output_format>
Reply in Vietnamese. Report what changed per item, the test results, screenshot paths, and anything not verified. Do not re-narrate the diff.
</output_format>

Start with task 2A, after reading the relevant todo files and the current state of the ui/puzzle-modern branch.
