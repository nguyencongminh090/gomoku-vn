# B498 — Presence: remove deprecated wire fields (PS-13)
**Status:** ✅ FIXED 2026-11-27 — friend rows send only `st`; room `presence` kept (no room `st`). [fix-log](../fix-log/2026-11-27-498-presence-remove-legacy-fields.md)
**Area:** server payloads, client readers
**From:** features/presence-status (planning §2c), 2026-11-27   **Depends:** #497 + one deployed release
## Scope
1. Drop fields superseded by `st` once no cached client reads them.
## Done when
- grep shows no reader; npm test green.
