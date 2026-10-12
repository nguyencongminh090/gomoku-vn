---
name: ticket-rows
description: gomoku-vn list-row ("ticket") style — meta as separate segments (no "a · b · c" strings), real padding, title > meta > action hierarchy
type: project-decision
apply_when: "adding or restyling any list row / card / ticket (home dashboard, forum, tournaments, lists); writing a meta line with several facts"
confidence: medium (user decision 2026-10-12; spacing numbers follow vbase-layout-spacing)
sources:
  - user instruction 2026-10-12 (home dashboard ticket review)
  - related: vbase-layout-spacing (proximity, whitespace as hierarchy), vbase-typography
date: 2026-10-12
---

# Ticket rows

1. **No joined meta strings.** Never build `a · b · c` (or `a - b`, `a | b`) in JS. Pass segments as an
   array; render each as its own `<span>` and space them with CSS `gap` (flex, wrap). Reference:
   `row()` + `.hrow__meta` in `client/js/lobby-home.js` / `client/css/shell.css`.
2. **Never padding 0 / edge-flush content.** Rows get real padding on the 4px scale (ticket: `12px 16px`),
   a raised surface + radius, and 8px between tickets instead of hairlines. Empty-state blocks share the
   same horizontal padding so they align with tickets.
3. **Hierarchy, three levels:** title (15px, 600) > meta (12.5px, muted, 4px below title) > action
   (small pill, own background, padded). Put identity in the title, supporting facts in meta.
4. Scope row styles to the page (`body.zen-lobby .hrow`) — `.prow` is shared with profile/club pages.
5. Tests assert segments (`.hrow__meta > span`), not a concatenated string.
