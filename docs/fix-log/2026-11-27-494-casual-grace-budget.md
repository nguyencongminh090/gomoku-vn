# 2026-11-27 00:59 — #494 casual games: one cumulative 60 s grace per player per game (problem 2, casual)
## Prompt
features/presence-status phase 2, Q3 = A (approved 2026-11-27).
## Root cause
`cancelDisconnectGrace` deleted the grace entry, so every new drop started a fresh 60 s with the clock paused —
unlimited unclocked thinking time by dropping repeatedly (casual games keep the pause after #493).
## Fix
DisconnectHandler.startDisconnectGrace: budget = engine.absence.left[uid] (default DISCONNECT_GRACE_MS), timeout =
budget, entry carries `since`; cancelDisconnectGrace spends (now − since) from it. game:interrupted secondsLeft
shows what is left. Expiry stays void (casual). Per player, per game (new engine = new budget).
## Verification
rated-absence.test.js #494 block (refill blocked → 2nd drop ends at 20 s; per-player budgets). Existing
DisconnectHandler suite unchanged. npm test green. NOT verified: real browser (#497).
