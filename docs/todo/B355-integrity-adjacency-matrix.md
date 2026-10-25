# B355 — Integrity tab: community-sorted adjacency matrix view
**Status:** ✅ DONE 2026-10-25 (jsdom; real-browser pass pending)
**Area:** client/js/admin-integrity-viz.js (new `matrix` chart + view toggle), client/css/puzzles.css (`.ri-*`), client/js/i18n.js (vi+en), client/tests/admin-integrity.test.js
**From:** user, 2026-10-25 (item 5 of the declutter proposal, split from #353)   **Depends:** — (reads the same `viz.nodes`/`viz.edges`; nicer after #353 trims the node set)

## Problem
Node-link graphs turn into hairballs on dense data. A matrix stays readable: rows/columns are players, cell shade = games between two players, and a tightly-playing group shows as a dark block on the diagonal.

## Scope
1. SVG matrix: players sorted by community (largest first), then games desc; cell shade = games (same scale as edge width, log or sqrt so one heavy pair does not wash out the rest); community colour strip along both axes, reusing `viz-c*` slots.
2. Tooltip (`<title>`) on cells: `A – B: N games`; hover highlights row+column and fills the readout.
3. Toggle "Network | Matrix" in the graph panel; remember choice per session only (no persistence).
4. Cap: if nodes > ~150, draw only the nodes the network shows (same set), never the full 1351.

## Don't
- Don't replace the network view; the matrix is a second view.
- Don't add a server call or change the `viz` payload.

## Traps
- 120×120 = 14,400 `<rect>`; build with one `<path>` per shade bucket or a canvas if SVG is slow — measure before choosing.
- Colour must not be the only cue: keep the diagonal block outlines and the tooltip text.
- Dark and light themes: shade ramp must pass contrast on both (`--viz-*` tokens, see dataviz notes in puzzles.css).
- Axis labels unreadable at 120 rows: label only community boundaries + hovered row/col.

## Why this way
Matrices scale with density instead of degrading; block structure makes closed groups visible without layout tuning.

## Done when
- Toggle switches views; on the sim DB the main community blocks are visible at a glance.
- jsdom test for ordering, cell count and tooltip text; real-browser pass at 1440 and 375, both themes.
