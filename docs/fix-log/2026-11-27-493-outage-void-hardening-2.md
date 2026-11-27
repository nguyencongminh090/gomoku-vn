# 2026-11-27 01:33 — #493 follow-up 2: outage void tightened again (second security review)
## Prompt
Automated security review of 4aa0b793: an outage could still be opened by drops the leaver controls; suggested
members-only counting, both seats dropping close together, and a cap on extending the window.
## Root cause
The previous fix required both seats to drop inside an open outage, but guest tabs (free to open) still counted
toward opening it, the two seats could drop minutes apart, and a steady trickle of drops kept extending the window.
## Fix
DisconnectHandler OUTAGE: count distinct MEMBERS only (guest ids ignored) with min 6 (was 10 raw drops), both
seats' drops within pairGapMs 15 s of each other, window capped at maxMs 5 min from its first opening.
## Verification
rated-absence.test.js: guest-tab flood → no outage; member flood with opponent connected → 'abandon'; seats
dropped 20 s apart → 'abandon'; real outage (both seats together) → void. Residual: a leaver controlling ≥ 6
member accounts AND an opponent who drops within 15 s of them — accepted (staff review sees it in #496 data).
