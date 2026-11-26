---
name: presence-and-abandonment
description: How game platforms model player status (separate axes) and handle disconnects and game abandonment (reconnect window, clock, result, repeat leavers), with the browser lifecycle limits behind it.
domain: gomoku-vn
tags: presence,status,disconnect,abandonment,grace,clock,fair-play,page-lifecycle
apply_when: "Before changing player status/presence vocabulary or derivation, disconnect grace, the result of an abandoned game, repeat-leaver limits, or fair-play logging of away/disconnect events"
sources: "lila RoundSocket.scala + RoundAsyncActor.scala (github lichess-org/lila master, read 2026-11-26); Chess.com support 'Abandonment on Chess.com' (support.chess.com/en/articles/8593801, via search summary 2026-11-26); Discord gateway events, Steam ISteamFriends, Chrome Page Lifecycle API (cited by the user's prompt, not re-read); features/presence-status/planning.md audit"
last_reviewed: 2026-11-27
confidence: medium
---
# Presence and abandonment

## Why this note exists
gomoku-vn computed status in four places with four vocabularies and voided abandoned games while an
explicit Leave counted as a loss. This note records what established platforms do so the decision in
`features/presence-status/` is grounded, not habit.

## Status model (separate axes)
1. **Discord**: user-chosen status online / idle / dnd / invisible (shown as offline to others) / offline,
   separate from activities ("Playing X"). Idle is also set automatically. (Gateway events docs, cited.)
2. **Steam**: persona state (offline, online, busy, away, snooze, looking to trade/play) is kept separate
   from **rich presence** (what the player is doing). (ISteamFriends docs, cited.)
3. Lesson: keep **connection**, **attention** (active/away), **activity** (what) and **visibility** (hidden)
   as independent axes; derive one label per audience with a fixed precedence. A room/table scope is
   separate again: one can be on the site and away from the table (gomoku-vn #373/#422).

## Disconnect / abandonment
| | Chess.com (official article) | Lichess (lila source) |
|---|---|---|
| Window | 0.1 × (base + 40 × increment), clamped 30 s–3 min | 30 s × speed factor (bullet 1, blitz 2, rapid 4, classical 10) ÷ 2 if materially much worse ÷ 2 for anonymous; × `goneWeight`; floor 10 s; 10 s if the player explicitly left (`bye`) |
| Clock | runs ("timeout" = clock hit zero while disconnected) | not stated in files read |
| Result | automatic, game ends | opponent **claims** win (`resign-force`) or draw (`draw-force`) once the absent player `isLongGone`; Tick only notifies |
| Both gone | 15 s → game ends (article; draw/unrated per prompt) | `Abandon` path: aborted if abortable, else resign for side to move |
| Repeat leavers | forum claims only | `goneWeight` per player (definition not read) |

lila constants read: `ragequitTimeout = 10.seconds`, `disconnectTimeout = 30.seconds`, `tickSeconds = 5`.

## Browser lifecycle limits
- `visibilitychange` is the most reliable lifecycle signal on mobile; `pagehide`/`unload`/`beforeunload` are
  unreliable; frozen tabs stop timers (Chrome Page Lifecycle, cited).
- Focus/visibility signals are spoofable (userscripts) and lost for innocent reasons (split screen, second
  window, system dialogs, calls). Use them as **weak evidence for human review**, never as automatic penalties.
- Server-side detection of a silent loss = engine.io ping interval + timeout (defaults 25 s + 20 s in this app);
  a reconnect window should be counted from detection, and the clock is the bound until then.

## Rules for gomoku-vn
1. One server derivation (`server/presence/`), one wire shape, one client renderer; pages never derive their own.
2. Away never ends a game. Absence (socket gone) does, within a window tied to the time control.
3. A server restart never counts as abandonment (rooms are in memory).
4. Repeat-leaver limits for members live in the DB; for guests per guest id, never per IP (CGNAT, #372).
5. Fair-play data: per-game summary counters only, staff-only, bounded retention, players told.

## Do not use when
Pure clock maths (`server-client-clock-sync.md`) or broadcast volume (`broadcast-fanout-perf.md`).

## Related
- `realtime-reliability-resync.md`, `broadcast-fanout-perf.md`, `proxy-client-ip-rate-limit.md`
- `features/presence-status/planning.md`; items #113 #114 #115 #157 #367 #372 #373 #422
