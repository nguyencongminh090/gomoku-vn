# B353 — Integrity network graph: declutter (suspect-first, group bubbles, edge filter)
**Status:** BUILT on feature/353-graph-declutter (uncommitted, no real-browser pass yet; scope 1–4 done, 5 skipped)
**Area:** client/js/admin-integrity-viz.js (`graph`), server rating-integrity `viz` payload (node/edge selection), client/css/puzzles.css (`.ri-*`), client/js/i18n.js, client/tests/admin-integrity.test.js
**From:** user, 2026-10-25 — "data is too dense, hard to review"; after #249 follow-up (no-overlap + zoom/pan, ui/admin-layout 44cad5c)   **Depends:** —

## Problem
The graph draws the 120 most-active players with every edge between them. Heavy players mostly play each other, so it is a hairball even with no overlap. Node selection is by activity, not by suspicion, while the tab exists to find collusion.

## Scope
1. **Suspect-first default:** nodes = flagged players (`players[]`, ~28) + their top opponents (~30–50 nodes); edges from the pairs already computed. Toggle "All (120)" for the old view.
2. **Two-level view:** overview = one bubble per Louvain community (size = members, edge width = total games between groups). Click a bubble → expand its members, dim the other groups.
3. **Edge filter:** slider "min N games between two players" (default hides weak edges) + toggle "cross-group edges only".
4. Graph helpers (name search, click-to-pin, no halo for tiny groups) → split out as #354.
5. Community-sorted adjacency matrix as a second view → split out as #355.

## Don't
- Don't change ratings or any scoring; the tab stays read-only/descriptive.
- Don't add an API unless the suspect-first node set can't be derived from the existing payload.
- Don't re-tune the force layout again — the problem is what is drawn, not the layout.

## Traps
- Sim DB (`exports/vncaro-sim.db`) is denser than real data; check against both before judging.
- Community colors: only 5 slots, rest fold into "other" (`SLOTS`) — bubbles view must keep that.
- jsdom has no layout: test selection/filter logic, not pixels; do a real-browser pass for the rest.

## Why this way
Overview first, filter, details on demand. Suspect-first aligns the picture with the tab's purpose; bubbles make 12 groups readable; the slider handles whatever density remains.

## Done when
- Default view shows ≤ ~50 nodes and answers "who looks suspicious" at a glance on the sim DB.
- Group bubble drill-down and edge slider work (jsdom tests + real-browser pass at 1440 and 375).
