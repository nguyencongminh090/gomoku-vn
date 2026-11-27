# 2026-11-27 01:01 — #493 follow-up: outage void could be self-triggered (security review)
## Prompt
Automated commit security review of 6cea4d4a: "business-logic / rating manipulation" in DisconnectHandler noteDrop.
## Root cause
The Q13 outage window counted raw socket drops (≥10 and ≥30 % in 5 s) and then voided ANY absent player's
abandonment or clock loss. One player could open ~10 throwaway guest tabs (or flap sockets), close them together,
open the window and leave a lost rated game for a void instead of a loss.
## Fix
DisconnectHandler: count distinct users per window (`_winCount`), keep each user's last drop for window+hold
(`_lastDrop`), and void only when the outage covers BOTH players of the game (`outageCovers`) — a real
tunnel/network blip drops both seats; a self-made flood leaves the opponent connected, so the loss stands.
Same rule for the clock-timeout path (`voidsClockTimeout`).
## Verification
rated-absence.test.js: real outage (both seats) → void; guest-tab flood with opponent present → 'abandon' and no
clock void; one account flapping 20× → no outage. npm test green.
