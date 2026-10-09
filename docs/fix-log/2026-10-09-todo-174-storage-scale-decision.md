# 2026-10-09 — #174 Platform storage/scale decision
## Prompt
"Do #174"
## Root cause
n/a (decision task). Question: is SQLite enough for rating history + leaderboards at "thousands" of users.
## Fix
Synthetic benchmark (scratch script, temp DB outside repo; real `gomoku.db` untouched) → decision recorded in `features/platform/planning.md` Q8: keep SQLite + async rating-write queue + `synchronous=NORMAL`; Postgres triggers listed. Reasoning: `docs/knowledge/data-storage-selection.md` (don't fragment while one store suffices).
## Verification
Measured, numbers in Q8. Not measured: prod host, live socket contention, backup at GB scale. No code change, no `?v=` bump.
