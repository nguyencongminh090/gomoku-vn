# B328 — Quick-match status line: facts as chips, guest sentence as a note
**Status:** FIXED
**Area:** client/js/lobby-home.js (`setSegments`), client/css/shell.css (`.qm-line*`), client/js/i18n.js (`qm.selected`), client/tests/lobby-home.test.js
**From:** ticket-rows.md ("a · b · c" strings), ux-audit `docs/audits/ux-audit-2026-10-23-qm-line.md` M1+L1, 2026-10-23   **Depends:** —

## Problem
`#qm-line` joined facts with " · " in one string; the guest sentence ("khách chỉ chơi giao hữu…") read as a chip and wrapped.
## Scope
1. Lead label plain; rule = green chip (`rtag--rule`); time/wall/portal/queue/ETA = `.rtag` chips; guest sentence = `.qm-line__note` on its own line.
2. Searching line: lead + optional queue chip, never the green one (explicit class, not `:nth-child`).
## Don't
- Don't change matchmaking logic or the chip pickers above the line.
## Done when
- Tests assert no "·", one `rtag--rule` idle, none while searching; browser pass at 375/1280 clean.
