# 2026-11-15 20:06 — untracked Tournament standings and completion

## Prompt
“Fix backend: tìm các potential issues và sửa lỗi” (Tournament Ranking).

## Root cause
Swiss tiebreaks kept one result per opponent, so a later rematch overwrote earlier results. Finalization saved the tournament status and each rank separately. An interrupted write left the completed tournament with missing ranks after reload.

## Fix
Count each completed pairing in Buchholz and Sonneborn–Berger. The tournament detail applies the saved ranks to completed standings. Persist status and ranks in a single transaction before changing in-memory state. Restore missing legacy ranks from saved pairings on reload.

## Verification
Four targeted Jest suites passed, 172 tests. Regression cases cover rematch order, SQLite rollback and restart recovery, partial legacy standings, and rendering saved ranks.
