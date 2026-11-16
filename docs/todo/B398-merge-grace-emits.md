# B398 — Merge disconnect-grace emits (drop: 2→1 to opponent; resume: 3→1 to self, 2→1 to opponent)
**Status:** OPEN
**Area:** `server/socket/handlers/DisconnectHandler.js` (`startDisconnectGrace`, `cancelDisconnectGrace`),
`client/js/room-socket.js` (`game:init` :317, `timer:sync` :688, `game:interrupted` :976, `game:resumed` :986)
**From:** #396 evaluation 2026-11-16, owner: "gộp event"   **Depends:** #396 cuts (fix/396-storm-poll-burst)

## Problem
Per storm pair: drop sends `timer:sync` + `game:interrupted`; resume sends `timer:sync` + `game:resumed` to the room
(self included) + `game:init` to self (already carries `timerSync`). ~4 packets/pair are redundant: ~4 000 per 1k storm,
est. 50–100 ms CPU (~13 µs per room emit + ~14 µs per ws write, profile in fix-log 396).

## Scope
1. Drop: `game:interrupted` carries `timerSync`; client applies it (`applyTimerSync`).
2. Resume: `timer:sync` + `game:resumed` go to the room EXCEPT the reconnecting socket (`socket.to(roomId)`);
   `game:resumed` carries `timerSync`. Self gets only `game:init` — it must then do what `game:resumed` did for
   self (status 'ongoing', `armTurnWatchdog`, "reconnected" chat line if still wanted).
3. Keep the separate `timer:sync` emit for one release (old cached tabs) unless owner accepts the gap; decide and
   note in the fix-log. Without dropping it, step 1/2's opponent-side saving is nil.
4. Measure: profiled + ≥ 2 unprofiled `mixed.sh` runs each side (same table as fix-log 396).

## Don't
- Don't touch `timer-sync-core.js` maths or the tournament clock (`tournament-match.js`).
- Don't add client reconnect jitter.

## Traps
- Old client tabs during deploy: no `timer:sync` → clock frozen until the next move's sync.
- `otherStillAway` branch sends `game:init` with `timer: null` and no resume — keep it unchanged.
- Clock change → re-check `.claude/rules/diagnostic-page-sync.md` (a)–(c); client edit → cache-bust.
- Expected gain is inside storm ELD/ack noise (116–454 ms same-code spread); success = profile delta.

## Why this way
Payload piggy-back over a new combined event: existing handlers keep working; no new event names.
Rejected: `features/` folder (no user-facing design). Knowledge notes: none.

## Done when
- jsdom: `game:interrupted`/`game:resumed` with `timerSync` apply the clock; self resume via `game:init` alone
  leaves status 'ongoing' + watchdog armed. Server: emits per drop/resume counted in `DisconnectHandler.test.js`.
- Real-browser pass: two tabs, drop one, reconnect, both clocks right. Fix-log with profile + run table.
