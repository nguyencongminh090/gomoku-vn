# B258 — Split server/db/database.js (1329 lines) by domain
**Status:** OPEN
**Area:** server/db/database.js and all `require('../db/database')` callers
**From:** DB architecture review 2026-10-16   **Depends:** B255 (migrations leave first)

## Problem
One file holds init, migrations and helpers for users, sessions, games, tournaments, social, puzzles, forum.

## Scope
1. `db/connection.js` (open, pragmas, timers) + `db/<domain>.js` helper modules.
2. `database.js` stays as a facade re-exporting everything, so callers and jest mocks keep working.
3. Move code only; no behaviour or SQL change.

## Don't
- Don't rename exports; don't mix in B255/B257 changes.

## Traps
- Tests mock `server/db/database`; a second connection to the same file would break `:memory:`/temp DB tests.

## Why this way
Facade keeps the diff mechanical. Notes: SKILLS_TREE `knowledge/software-design/items/cleancode-module-split.md` (reference: exports diff, no cycles, mock caveat).

## Done when
- Full `npm test` unchanged-green; no export removed (diff of `Object.keys(module.exports)`).
