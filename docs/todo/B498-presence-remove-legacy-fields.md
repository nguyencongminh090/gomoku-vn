# B498 — Presence: remove deprecated wire fields (PS-13)
**Status:** OPEN
**Area:** server payloads, client readers
**From:** features/presence-status (planning §2c), 2026-11-27   **Depends:** #497 + one deployed release
## Scope
1. Drop fields superseded by `st` once no cached client reads them.
## Done when
- grep shows no reader; npm test green.
