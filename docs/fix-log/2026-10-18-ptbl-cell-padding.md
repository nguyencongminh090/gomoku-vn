# 2026-10-18 — .ptbl rows (rankings) had 0 left cell padding
## Prompt
Fix `#rk-body tr td` — Ranking lines: violate UI rules about padding.
## Root cause
platform.css `.ptbl td` was `12px 12px 12px 0` (th `10px 12px 10px 0`) with the 16px gutter on `.ptbl-wrap`, so the row hover / `.is-me` highlight started flush against the text (ticket-rows rule 2: never padding 0). Shared by rankings + club tables.
## Fix
td `12px`, th `10px 12px`, wrap `4px 4px 8px`: same text position, highlight now has inner padding. cache-bust --write.
## Verification
`client/tests/ptbl-cell-padding.test.js` (fails on old `0` left padding). npm test 3341 pass. Not checked in a real browser.
