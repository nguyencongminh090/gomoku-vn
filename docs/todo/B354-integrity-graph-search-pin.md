# B354 — Integrity graph: name search, click-to-pin, no halo for tiny groups
**Status:** ✅ DONE 2026-10-25 (jsdom; real-browser pass pending)
**Area:** client/js/admin-integrity-viz.js (`graph`: `focus`/`blur`, `hulls`), client/css/puzzles.css (`.ri-*`), client/js/i18n.js (vi+en), client/tests/admin-integrity.test.js
**From:** user, 2026-10-25 (items 4 of the declutter proposal, split from #353)   **Depends:** — (works on the current graph; reuses zoom/pan camera)

## Problem
With ~120 nodes you cannot find a named player, and the focus readout only shows on hover/keyboard focus, which touch screens do not have. Groups of 1–2 players get a dashed halo that adds noise.

## Scope
1. **Name search:** input above the graph (accent-insensitive, like the existing NLP name search); a match highlights the node (others dim like `focus`), pans/zooms the camera onto it, and fills the readout. Esc/clear restores.
2. **Click-to-pin:** click (tap) a node pins its focus state (readout + dimming) until clicking the background or another node; hover no longer clears a pinned node. Dragging must not pin.
3. **Halo threshold:** draw a community halo only for groups with ≥ 3 members (constant, not a magic number inline).

## Don't
- Don't change the force layout or node/edge selection (#353 owns that).
- Don't add a server call; search runs over the nodes already in `viz`.

## Traps
- `pointerdown` starts a drag (`n.fixed`) and calls `focus`; separate click from drag by distance moved.
- Pan code in `s` listens to `pointerdown` only when the target is the svg itself — keep node clicks out of it.
- Labels are hidden except top 6 (`is-hover`); a searched/pinned node must show its label.
- jsdom has no layout: test search/pin logic via attributes and classes; camera pan needs a real-browser pass.

## Why this way
Hover-only focus fails on touch and keyboard users need a way to locate a person; pinning and search are the cheapest way to make a dense graph navigable.

## Done when
- Typing a name highlights and centers that node; clearing restores the view.
- A tap pins focus; tapping empty background releases it; drag does not pin.
- Groups < 3 have no halo. jsdom tests for all three + a real-browser pass at 1440 and 375.
