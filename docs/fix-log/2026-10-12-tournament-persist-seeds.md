# 2026-10-12 — #242 tournament seeds assigned + persisted at start; hydrate orders by seed
## Prompt
"Do #239 240 243 244 242 245 246 (sequencely, commit after each)"
## Root cause
entry.seed was never set; hydrate rebuilt the bracket from ORDER BY registered_at, so same-ms registrations (or skew) could swap seeds and corrupt the bracket.
## Fix
startTournament assigns seed 1..n in registration order and persists it (updateTournamentPlayerSeed); getTournamentPlayers orders by seed (NULLs last), then registered_at, then rowid. No reseed UI.
## Verification
Test: seeds 1..4 persisted; after pushing the first registrant's registered_at to the future, reload yields the identical playersBySeed. npm test before commit. Server-only.
