# 2026-11-15 — Ranking search and profile requests

## Root cause

- Ranking search ran only for the global scope, and its SQL projection omitted city and country.
- Ranking and profile chart requests could finish out of order. Filter controls were rebuilt on selection, moving keyboard focus. Profile history swallowed pagination errors.

## Fix

- Apply search within the selected scope and preserve each player's rank within that scope. Include location and paginate matching results.
- Cancel superseded requests, preserve focus and announce loading and errors. Keep the current profile game history in place when a later page fails so it can be retried.

## Verification

- Jest regressions cover scoped search, location, request ordering, focus, and failed history pagination.
- Chrome against an isolated SQLite database exercised rankings and profiles at 1280 px in light mode and 375 px in dark mode.
