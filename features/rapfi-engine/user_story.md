# Rapfi engine backend — user stories
Status: **design only, not authorized to implement** (size L). Planning: [planning.md](planning.md) · [engine-integration](engine-integration.md) · [state](diagram/state.md) · [sequence](diagram/uml_diagram/sequence-engine-job.md)
Source: user task 2026-11-16 (engine at `Rapfi_V3_PTR/dev/rapfi`, reference site `GomokuBoardSite`). Step 2 of the task was cut off — see planning.

## Actors
Player (guest/logged in) · Spectator · Room host · Admin · Engine service (server-side) · Puzzle curator.

## Stories (candidate, scope to be confirmed — planning Q1)
- Play vs bot: pick difficulty and style (Normal/Aggressive/Defensive/Troll) in a room; the bot answers within the clock.
- Analysis: replay shows eval bar, best line, move-quality labels (replaces the "sắp có" placeholder in `features/learn`).
- Puzzle verification: `PuzzleVerifier` can ask the engine whether a position is a forced win.
- Spectator/host hint: engine suggestion (never in rated games between humans).

## Decided 2026-11-16
Engine hosted on the client, server-driven, leased per game; multi-purpose service ([backend-design](backend-design.md)). Swap2 not used. Future work.

## Rules / constraints
- Server stays the single source of truth: an engine move is a proposal validated by `GameEngine.makeMove`.
- Engine supports a subset of gomoku-vn rules (see engine-integration §4): caro overline and swap2×non-freestyle gaps.
- Bot games are unrated or separately rated (planning Q4); never feed the human anti-cheat/integrity graph.
- Engine runs as an isolated process/worker with CPU and memory caps; one serialized command queue per engine instance.
- GPLv3 duties if engine binaries are shipped/served.
- Messages shown to users use codes (`i18n-and-server-message-codes`).
