# 2026-10-12 12:03 — #248 tournament result bracket views
## Prompt
"UI of result for tournament: Round Robin cross table; Swiss and double eliminate: branch/tree UI with assigned player name. Design correspond to ArenaUI."
## Root cause
Not a bug: client lacked the DE skeleton and per-pairing `bracketMatchId` (serializePairing never sent it, so the games-history match label was also always "—" for DE).
## Fix
Server serialize additions; client views in tournament-detail.js + tournament.css (+ i18n vi/en). Branch feature/248-bracket-views. ?v=338 → 345.
## Verification
New jsdom suite (5 tests), npm test green; real-browser pass (isolated server copy) dark/light/390px. NOT verified: reset match, live card, champion strip in browser.
