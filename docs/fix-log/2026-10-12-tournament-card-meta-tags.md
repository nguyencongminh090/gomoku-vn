# 2026-10-12 — untracked: tournament cards joined meta with "a · b · c"
## Prompt
"Tournament violate rule about ticket, it used a . b . c. You can replace with tags"
## Root cause
`renderCard()` (client/js/tournaments.js) built the meta line with `.join(' · ')` and appended the status with ` · `, against docs/knowledge/ui-ux/ticket-rows.md rule 1.
## Fix
Each fact is its own `<span class="rtag">` (same chip as lobby room tickets); `.tournament-card__meta` in lobby-zen.css is a wrapping flex with `gap: 6px 8px`. Status span stays a sibling. `?v=346`.
## Verification
New test in client/tests/tournaments-my-clubs.test.js (≥3 `.rtag` children, no " · "). Real-browser look not done.
