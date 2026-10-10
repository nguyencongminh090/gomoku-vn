# 2026-10-09 17:30 — #196 Dashboard clock label: increment shown for per_game
## Prompt
Found by the agent while starting R3: Fischer clock = existing `blitz` mode, so the R2 label was wrong.
## Root cause
B195's `ruleLine()` mapped `per_game` → "min+inc". In `TimerManager` only `blitz` adds the increment;
`per_game` is a fixed total, so a 5-min game with a stray `timerIncrementSeconds: 3` showed "5+3", and real
blitz rooms showed nothing.
## Fix
`blitz` → `m+inc` (`30s+2` below a minute); `per_game` → `home.per_game` / `home.per_game_s`; `per_move` unchanged.
## Verification
`client/tests/lobby-home.test.js` ruleLine table (blitz whole/sub-minute, per_game whole/sub-minute) — 6 failed
before, 25/25 after. ?v 191→192.
