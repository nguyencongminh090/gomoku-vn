# Fix log entry — 2026-08-01 22:30

## Prompt

Surface 1: lobby room cards — Lite identical to Default (phase-1 card+chip already *is* the Lite treatment); Pro expands the single chip back into the full Wall/Portal/Swap2/Caro/board-size tag breakdown.

## Action

`buildRuleChip()` in [client/js/lobby.js](client/js/lobby.js) now delegates to a new `buildRuleTags()` when the mode is `pro`, otherwise returns the phase-1 chip unchanged; added a `uiMode()` helper and a `uimodechange` listener alongside the existing `langchange` one. `.rule-tag--swap2` / `--win` / `--size` styles plus `white-space: nowrap` on `.rule-tag` in [client/css/lobby.css](client/css/lobby.css).

## Decision

Tags reuse the `.rule-tag` classes that phase 1 deliberately left in the stylesheet for exactly this, and render into the existing `.room-card__chips` flex-wrap row — so Pro wraps to a second row of tags rather than reintroducing the pre-fix `<table>` cell wrapping. Rewrote the old tag colours to theme custom properties (`--c-success`, `--c-accent`) instead of the hardcoded hex values the pre-fix `buildRuleTags()` used, which bypassed the light/dark system. Lite deliberately shares Default's exact code path — no branch at all — so the "no further trimming" rule can't drift.

## Summary output

16 assertions passed. Lite and Default each render exactly 1 `.rule-chip` and 0 `.rule-tag` per card, and their `.room-cards` innerHTML is byte-identical. Pro renders 0 chips and the real breakdown — `[["19×19","Ô khoá","Caro"],["17×17","Swap2","Tiêu chuẩn"],["17×17","Tự do"]]` — against purpose-seeded Wall+Caro, Swap2+Standard and plain rooms. In all three modes: status badge visible on every card, no `.room-table`, no horizontal overflow, zero elements wrapping mid-text (Range line-box probe). At 375px Pro wraps tags to a second chip row with no overflow and no mid-text wrapping. Screenshots: [docs/screenshots/mode-cards-pro-1280.png](docs/screenshots/mode-cards-pro-1280.png), [docs/screenshots/mode-cards-default-1280.png](docs/screenshots/mode-cards-default-1280.png), [docs/screenshots/mode-cards-pro-375.png](docs/screenshots/mode-cards-pro-375.png).
