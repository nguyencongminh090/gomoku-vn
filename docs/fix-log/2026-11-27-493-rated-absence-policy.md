# 2026-11-27 00:57 — #493 rated games: running clock + absence budget; abandonment loses (problems 1, 2)
## Prompt
features/presence-status phase 2, approved Q1/Q2/Q11/Q12/Q13 = A ("Approve at all").
## Root cause
DisconnectHandler treated every in-game drop the same: `timer.stop()` (both clocks), room `interrupted`, a fresh 60 s
per drop, expiry = void (`noScore`). So closing the tab in a lost rated game voided it while Leave lost it (1), and
each drop on your own turn bought up to 60 s of unclocked thinking, unlimited times (2).
## Fix
- DisconnectHandler: rated (`engine.isRated()`) → `startAbsence`: no pause, room stays `playing`, `game:absent`.
  Budget W per player per game (per_game/blitz clamp(0.1×(base+40×inc),30,120) s; per_move = per-move s), spent on
  own turn only (engine.currentTurn, 1 s poll with real elapsed time, never emits), not refilled on return.
  W out → {winner: opponent, reason 'abandon'} rated. Abortable (GameEngine.actedBy lacks a player) → 'abort' void
  at 30 s. Both absent 15 s → 'both_absent' void. Outage (≥10 and ≥30 % of sockets drop in 5 s → 2 min) → void;
  also voids an absent player's clock timeout (GameHandler onTimeout, lazy require) — Q13 read for its purpose.
  Game ending any other way → entry cleared, seat to the normal spectator grace. engine.absence.absentAtEnd for #495.
- Return: entry kind 'absence' → `game:resumed` to others + `game:init` (running sync), no wait for the other.
- Deviation from Scope 4: new `game:absent` instead of a running sync on `game:interrupted` (the old handler
  freezes the board). Old room-page JS cannot be mid-game after a deploy (#398 argument: in-memory rooms).
- Client: room-socket `game:absent` handler; i18n room.absent*, sys.player_abandoned/game_aborted_absent/
  game_both_absent/game_outage_void, history.reason_abandon (+ replay reasonMap). Casual path unchanged (#494).
- diag-page-sync (a)-(c) re-checked: TimerManager / applyTimerSync / timer-sync-core untouched.
- Known trade-off: on a small site 10 page navigations in 5 s can open a false outage window → abandonment voided
  for 2 min (today's behaviour), never an unfair loss.
## Verification
rated-absence.test.js (21: W table, no pause, abandon rated+persisted+recordGame, opponent-turn start, budget not
refilled, #422 bounce, clock timeout once → seat grace, abort ×3, both gone, outage ×3, casual unchanged);
baseline rated drop = game:absent + room:updated + patch, poll silent; client game:absent; RoomManager emit
inventory 26 → 30. npm test 294/5251. NOT verified: real browser / phone (#497).
