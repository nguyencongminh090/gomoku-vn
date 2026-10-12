# 2026-10-12 — #246 tournament registration cap + close day (+ endsAt closes registration)
## Prompt
"Do #239 240 243 244 242 245 246 (sequencely, commit after each)"
## Root cause
Tournaments had no player limit or registration deadline; startsAt/endsAt were informational only.
## Fix
ruleSet.maxPlayers (int 2..512) and registrationClosesAt (day, UTC, last open day) validated/persisted; registerPlayer → TOURNAMENT_FULL / REGISTRATION_CLOSED (endsAt day also closes). listTournaments adds maxPlayers+registrationOpen; create form fields, card shows n/max and Full/Closed instead of Register; ?v=333. DECISION: no auto-start/auto-end and startsAt does not gate Start (per Don't) — dates only gate registration; no sweep added.
## Verification
Server tests (validation, cap, unregister frees seat, close-day boundaries, list fields, reload) + jsdom card/form tests. Real-browser pass on isolated copy: organizer creates cap=2 via modal; p1,p2 register (0/2→2/2), p3 sees 'Đã đủ người' with no Register button. npm test before commit.
## Follow-up (same day, user chose 'block Start before startsAt')
startTournament returns TOURNAMENT_NOT_YET before the startsAt UTC day; still no auto-start/auto-end and no sweep. i18n err.tournament_not_yet; ?v bumped.
