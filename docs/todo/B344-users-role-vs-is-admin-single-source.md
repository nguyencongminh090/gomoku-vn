# B344 — users.role vs users.is_admin: one source of truth
**Status:** OPEN
**Area:** server/db (users), server/middleware, server/routes (admin), migrations/
**From:** DB design review 2026-10-23   **Depends:** —

## Problem
`users` has both `is_admin INTEGER` and `role TEXT DEFAULT 'member'`. Two columns can disagree
(`is_admin=1`, `role='member'`); consistency rule 9 (one entity = one source).

## Scope
1. Grep every read/write of both columns; decide which is canonical (likely `role`).
2. Migration: heal existing rows to the canonical column, then derive/drop the other.
3. Regression test: promoting/demoting keeps a single value; no code path reads the dropped column.

## Don't
- Change permission semantics; only unify storage.

## Traps
- SQLite DROP COLUMN needs a recent version / table rebuild; follow migrations/README.md.
- `sessions`/socket auth may cache `is_admin`.

## Done when
- One column decides admin; migration + test kept; fix-log entry.
