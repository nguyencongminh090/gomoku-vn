# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #1: lobby room list is over-dense on desktop and breaks down on mobile — 6-column `.room-table` wraps header labels, room names and the Join button at 375px, and the mobile CSS hides the status column entirely. Covers M1 (mobile wrapping) and M2 (hidden status badge).

## Action

`renderRoomList()` in [client/js/lobby.js](client/js/lobby.js) now emits a `.room-cards` / `.room-card` list instead of `<table class="room-table">`; `buildRuleTags()` was replaced by `buildRuleChip()`. Table CSS in [client/css/lobby.css](client/css/lobby.css) replaced with card styles + `.rule-chip`, and the `≤640px` block no longer hides columns (it just tightens padding). Added `lobby.rules_standard` / `lobby.rules_custom` to both VI and EN dictionaries in [client/js/i18n.js](client/js/i18n.js).

## Decision

Cards are used at **all** viewports (not mode- or media-gated) so desktop and mobile share one code path. Rule cluster collapsed to a single chip whose text also carries the board size (`Luật cơ bản · 17×17`) — board size is plain-language, unlike Wall/Portal/Swap2, so folding it into the one chip avoided a separate element without reintroducing jargon. Status badge moved into the card's chip row so it renders at every width, fixing M2 by construction. **M1 and M2 are fully covered by this row — no separate rows are logged for them.**

## Summary output

Live check against the dev server with 4 seeded rooms (incl. one custom-rules room and a long room name). At 1280px and 375px: `.room-table` absent, 4 cards rendered, status badge present and visible on every card at both widths, rule chip present on every card, zero elements wrapping to >1 line (Range-based line-box probe over title / meta / Join button / status badge / rule chip), no horizontal document overflow. Screenshots: [docs/screenshots/fix1-lobby-1280.png](docs/screenshots/fix1-lobby-1280.png), [docs/screenshots/fix1-lobby-375.png](docs/screenshots/fix1-lobby-375.png).
