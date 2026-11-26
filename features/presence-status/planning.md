# presence-status — planning (phase 1: audit + design, no code)

Surveyed on `dev` @ `c1a2c3af`, 2026-11-26/27. Stories: [user_story.md](user_story.md). Diagrams:
[state + class](diagram/state-model.md), [sequences](diagram/uml_diagram/sequences.md). Sources and
platform comparison: [presence-and-abandonment](../../docs/knowledge/presence-and-abandonment.md).
Notes used: `be-realtime`, `realtime-reliability-resync`, `broadcast-fanout-perf`, `pattern-state`,
`proxy-client-ip-rate-limit` (CGNAT lesson), memory `reference-known-traps`; items #113 #114 #115 #157
#367 #372 (fix-log `2026-11-13-372-presence-review.md`) #373 #422.

---

## 1. Audit — every producer, store, transport and renderer of status

Latency = time from the real-world change to the surface showing it, derived from code (not measured).

### 1a. Producers (client signals)
| # | file:line | vocabulary | trigger | latency / cadence |
|---|---|---|---|---|
| P1 | `client/js/room-socket.js:72-90` | `room:presence` active\|away (`document.hidden \|\| !hasFocus()`) | visibilitychange, blur, focus; 2 s change-only poll; only while `roomData` set | immediate on edge |
| P2 | `client/js/socket-client.js:504-511`, `:593-598` | `presence:set` active\|away (same predicate) | same edges; 5 s change-only poll; every socket page **including room.html** | immediate on edge |
| P3 | `client/js/platform-shell.js:363-391` | `POST /api/presence` active\|away | first beat at 3 s, tick 20 s (silent once away sent), edges coalesced 250 ms; 16 pages incl. `index.html` (which also has a socket); members only | edge ~0.25 s; tick 20 s |
| P4 | socket.io connect/disconnect (`SocketHandler.js:328-337`, `:439-453`) | socket in `sessions` | TCP close → immediate; silent loss → engine.io default ping 25 s + timeout 20 s (no `pingInterval`/`pingTimeout` set in `server/index.js:299`) | 0 s … ~45 s |
| P5 | handshake `auth.roomPage` / `auth.roomId` / `auth.reconnect` (`socket-client.js`, read `SocketHandler.js:356`, `:372`, `:389`) | page identity | each connect | at connect |

### 1b. Server stores
| # | file:line | vocabulary | written by | notes |
|---|---|---|---|---|
| S1 | `server/socket/state.js:63` `sessions` | userId → newest socket | connect (evicts older, `SocketHandler.js:271-285`), disconnect | one socket per account; older tab gets `session:kicked` → login page (`socket-client.js:249-254`) unless `auth.reconnect` |
| S2 | `state.js:93` `awayUsers` | Set (away) | `setUserPresence` ← `RoomHandler.js:136-150` (P1+P2) | cleared on connect/disconnect |
| S3 | `state.js:109-145` `heartbeats` | userId → {at, away} (one entry per user) | `routes/presence.js:30-39` | TTL 45 s, prune every 15 s; **last write wins across tabs** |
| S4 | `state.js:75` `hiddenOnline` | Set | connect (`SocketHandler.js:332`), first beat (`routes/presence.js:33-36`), `PUT /api/profile` (`routes/profile.js:172`) | reloaded from DB after restart |
| S5 | `RoomManager.js:174,228` `room.users[].presence` | active\|away\|disconnected | `RoomManager.setPresence:460-471` (guard: never overwrites disconnected), `releaseSeat:326`, `RoomHandler.js:144`, `SocketHandler.js:379-383`, `LobbyHandler.js:154`, `DisconnectHandler.js:97,232,289,354,444` | 9 write sites |
| S6 | `state.js:27-40` `disconnectTimers`, `emptyRoomGraceTimers`, `spectatorGraceTimers` | per-user grace | `DisconnectHandler.js` | in-memory |
| S7 | `room.state` / `gameState.status` | idle\|playing\|interrupted / ongoing\|finished | GameHandler, DisconnectHandler | activity source |
| S8 | match queue (`MatchHandler`), `tournamentState.tournamentGameMap` | searching / in tournament match | MatchHandler, TournamentMatchHandler | not exposed per user |

### 1c. Derivations (each computes its own variant today)
| # | file:line | output vocabulary | rule |
|---|---|---|---|
| D1 | `state.js:152` `hasPresentSocket` | bool | socket && !away |
| D2 | `state.js:157` `isPresent` | bool | D1 \|\| fresh non-away beat |
| D3 | `state.js:164` `isVisiblyOnline` | bool | D2 && !hidden |
| D4 | `FriendService.js:159-167` `activityFromRoom` | playing\|watching\|free | playing needs `room.state === 'playing'` |
| D5 | `FriendService.js:179` | `online` + activity | D3; activity only when online |
| D6 | `SocketHandler.js:90` challenge seat check | bool | `sessions.has` |
| D7 | `SocketHandler.js:136` DM hooks | notify / live push | D1 / `sessions.has` |
| D8 | `TournamentMatchHandler.js:97-111` `_getSpectators` | list | socket.io room membership |
| D9 | `home-feed.js:38-40` | counts online/playing/searching | online = visible list size |
| D10 | `RoomManager.js:783,819`, `routes/home.js:148` | userCount / viewers | excludes `slot===null && disconnected` |
| D11 | `room-ui.js:334-347` `playerStatusInfo` | disconnected > away > playing (room.state) > waiting | client-side precedence |

### 1d. Transports
| # | event / route | carries | cadence | audience |
|---|---|---|---|---|
| T1 | `lobby:online_patch` (`state.js:875-886`) | joined/left of D3 | debounce 1.5 s | sockets in `lobby` |
| T2 | `lobby:online_query` (ack) | page / `{ids}` → online ids | pull, 200 ms throttle | lobby, DM window |
| T3 | `room:updated` users[].presence | S5 | debounce 80 ms per room | room members |
| T4 | `game:interrupted` / `game:resumed` | grace start/end | per event | room |
| T5 | `home:stats` (`home-feed.js:25`) | counts | debounce 1.5 s | home subscribers |
| T6 | `GET /api/friends` | `online` + `activity` + `roomId` + `startedAt` | social.js poll 10 s (visible only, `social.js:773`); pickers on open | friends |
| T7 | `user:status {offline}` (`PrivateChatHandler.js:130`) | offline on disconnect | per event | active DM peers |
| T8 | `tmatch:presence` (`TournamentMatchHandler.js:108-111`) | spectator list | on subscribe / disconnecting | match room |

### 1e. Renderers (UI consumers)
| # | file:line | shows | source |
|---|---|---|---|
| R1 | `room-ui.js:334-354,431` seat dot | dot-only + aria-label/title (#113 addendum) | T3 + D11 |
| R2 | `room-ui.js:876-885` spectators list / audience stack | only presence `active` | T3 |
| R3 | `rooms-h.js:25,89,303-361,453` roster + count | online roster, refresh 1.5 s | T1/T2 |
| R4 | `lobby.js:188-211` online list | online list | T1 |
| R5 | `lobby-home.js:173-191` | counts | T5 |
| R6 | `home-challenge.js:44-162` | Đang trực tuyến / Ngoại tuyến | T6 + online list |
| R7 | `challenge-modal.js:34,185-186` | same labels, `pdot--on` | T6 |
| R8 | `social.js:50-77,136-548,736` | playing (+mm:ss) / watching / free / offline | T6 |
| R9 | `private-chat.js:47-108,192-202,756` | "Trực tuyến trên Sảnh" / "Hiện không online" | T1/T2/T7 |
| R10 | `tournament-match.js:931` | spectators | T8 |
| R11 | `club.js:1723` members pane | none (#446 decision) | — |

**Four vocabularies for one person:** room (active/away/disconnected + playing/waiting), site
(online/offline, away = offline), friends (playing/watching/free/offline), DM (online/offline).

### 1e'. Coverage map — which item moves each audit row onto the one module
| rows | owner item | note |
|---|---|---|
| S2, S3, S4, D1-D3, P3 (per-tab beats) | PS-2 | stores stay, all reads go through `presence-core` |
| S5, D11, R1, R2, T3 | PS-2 (server), PS-6 (client) | `presence` wire field kept |
| D4, D5, T6, R6, R7, R8 | PS-4 | |
| D9, T1, T2, T5, R3, R4, R5, R9, T7 | PS-5 | |
| D6 challenge seat check | PS-2 | becomes `presence-core.hasSocket()` — same fact (a socket), kept distinct on purpose (#372 review) |
| D7 DM hooks | PS-2 | becomes `presence-core.canPushLive()` / `hasSocket()` — same facts, one module |
| D10 lobby userCount / home viewers | PS-2 | reads member `at !== 'gone'` from the core |
| D8, T8, R10 tournament spectators | **out of scope** | socket.io room membership is already the single source (`TournamentMatchHandler.js:84-86`); standing "don't touch tournament" decision |
| R11 club members | **out of scope** | #446 decision: no presence in the members pane |
| P1, P2 double report | PS-7 | |

### 1f. Verification of the reported problems
1. **Confirmed.** Grace expiry ends the game `winner:null, reason:'disconnect'`, `handleGameEnd(..., {noScore:true})`
   (`DisconnectHandler.js:375-394`); `room:leave` during a game resigns (`RoomHandler.js:47-63`). Closing the tab
   in a lost rated position voids it; pressing Leave loses it.
2. **Confirmed.** `startDisconnectGrace` calls `timer.stop()` (both clocks, whatever the turn, `:348-349`);
   `cancelDisconnectGrace` deletes the entry (`:439-441`), so the next drop gets a fresh 60 s. No per-game counter.
   #422 only prevents a restart while a grace is pending. Each deliberate drop on your own turn = up to 60 s unclocked.
3. **Corrected.** The disconnected player has no socket, so D3 is false and friends see **offline**, not free.
   The users wrongly shown as **free** are: the waiting opponent (room `interrupted`, D4 needs `playing`); a
   player who pressed Back and has a live lobby socket during grace; every tournament player (D4 reads only
   RoomManager). Also: a player who alt-tabs mid-game is **offline** to friends (away = offline) while the
   opponent sees "away"; "searching" never reaches friends.

### 1g. Further findings (verified by reading code unless marked)
- F1 Room page double-reports: P1 and P2 both fire on each edge → 2 inbound events; the second is a no-op
  (`changed:false`, no outbound). Cost is inbound only.
- F2 Two beat-only tabs (e.g. social + profile): S3 is one entry per user; the hidden tab's single `away` edge
  overwrites the visible tab's `active` until its next 20 s tick → the user flickers offline ≤ 20 s.
- F3 Fresh room-page load: P2's first change-only report could arrive before `room:join` sets `roomPageId`,
  marking the member away for one `room:updated`. **Unverified** (likely benign: the first P2 report waits for an
  edge or the 5 s poll). To test in item PS-1.
- F4 Detection lag: silent loss (phone frozen, NAT drop) is seen by the server after up to ~45 s; the grace
  starts only then. The client-side #435 probe reconnects the client faster but does not tell the server.
- F5 Hidden-online users still show their seat status to people in the same room (by construction; S5 ignores S4).

---

## 2. Canonical model

One server module, `server/presence/` (pure core `presence-core.js` + adapter in `state.js`), owns every
derivation in 1c. Two scopes, because a user can be on the site and away from the table at once (#373, #422).

### 2a. User scope (`UserPresence`, per account)
| axis | values | derived from |
|---|---|---|
| `conn` | `online` \| `reconnecting` \| `offline` | online = socket in S1 or a fresh beat in S3; reconnecting = neither, but a grace timer (S6) is pending; offline = otherwise |
| `attn` | `active` \| `away` | active if ANY live surface (socket page or beat tab) is active; away if all are away |
| `activity` | `idle` \| `searching` \| `playing` \| `watching` \| `tournament` (+ `roomId`/`pairingId`, `since`) | S7 (`playing` covers `playing` **and** `interrupted`), S8 queue, tournament map, room membership with `slot===null` and member state active/away |
| `hidden` | bool | S4 |

### 2b. Room-member scope (`MemberPresence`, per room user — stays `room.users[].presence` on the wire)
| field | values | meaning |
|---|---|---|
| `at` | `active` \| `away` \| `gone` | at the table (room-page socket, visible+focused) / room page hidden or on another page / no socket |
| `graceUntil` | ms \| null | deadline of the pending game/seat/empty-room grace (for a countdown) |

Wire compat: `presence` keeps `active|away|disconnected` (`gone` = `disconnected`); `graceUntil` is additive.

### 2c. One derivation, one wire shape, one renderer
- Server: `presence-core.statusOf(subjectId, audience)` → wire shape, audience ∈ `self | room | friend | public | staff`.
- Wire shape (additive, compact): `st: { c: 'on'|'re'|'off', a?: 1, k?: 'idle'|'search'|'play'|'watch'|'tour', r?: roomId, t?: sinceMs }`.
  Added next to today's fields (`online`, `activity`, `roomId`, `startedAt`, `presence`), which stay until no
  cached client reads them (one release, then removed in a later item).
- Client: `client/js/presence-view.js` (UMD, node-testable) — `describe(st | member, ctx) → { i18nKey, tone, glyph }`
  and `dot(...)` (HTML with `role="img"`, `aria-label`, `title`). Every renderer in 1e calls it; no page keeps its
  own mapping.

### 2d. Precedence
Outside the room: `hidden` (→ offline for non-self) > `conn` > `attn` > `activity`.
Inside the subject's room (room audience): member `at` + `graceUntil` > `activity` (game state).

| audience | sees | hidden-online |
|---|---|---|
| self | everything | n/a |
| room (opponent, spectators) | member state, grace countdown, playing/waiting | not applied (Q7) |
| friend | conn, attn (Q4), activity, roomId (watch link) | → offline |
| public (lobby list, counts, strangers, DM window of a non-friend) | online/offline only (away = offline, #372) | → offline |
| staff | everything + fair-play summary | not applied |

Tone table — one row per displayed state, the same on every page. Colours anchor on the #114 semaphore
(green → grey → amber → red by severity). Glyph shapes make colour not the only cue (Q8).
| state | i18n key (vi / en) | colour token | glyph |
|---|---|---|---|
| playing / in a tournament | `presence.playing` Đang chơi / Playing · `presence.tournament` Đang thi đấu / In a tournament | `--c-success` | filled dot with a core (`core`) |
| online, idle | `presence.online` Trực tuyến / Online | `--c-success` | filled dot |
| watching | `presence.watching` Đang xem / Watching | `--c-success` | ring |
| searching | `presence.searching` Đang tìm trận / Searching | `--c-success` | dotted ring |
| waiting (seat, game not started) | `room.status_waiting` Đang chờ / Waiting (kept) | `--c-border` | filled dot |
| away | `room.status_away` Đang rời trang / Away (kept in the room); `presence.away` Vắng / Away outside (Q8) | `--c-warning` | half dot |
| reconnecting (grace, with countdown) | `presence.reconnecting` Đang kết nối lại / Reconnecting | `--c-error` | ring with gap |
| disconnected / offline | `room.status_disconnected` Mất kết nối (room) · `presence.offline` Ngoại tuyến / Offline | `--c-error` (room) / `--c-border` hollow (outside) | hollow dot |
Change to note: social.js's current dot colours for playing/watching/free (`social.js:50`) move to this table.
The room keeps the user-chosen words "Đang rời trang" / "Mất kết nối" (#113/#114); outside the room the shorter
"Vắng" is proposed (Q8).

### 2e. Transition table (user scope) — maps row by row to phase-2 tests
| # | state before | event | state after | side effects |
|---|---|---|---|---|
| U1 | offline | socket connects (fresh) | online, active | online_patch (debounced) |
| U2 | online | socket reports away (live socket) | online, away | online_patch if visible set changes |
| U3 | online, away | socket reports active | online, active | same |
| U4 | any | report from an **evicted** socket | unchanged | ignored (`RoomHandler.js:138`) |
| U5 | online (socket only) | last socket closes, no grace pending | offline | online_patch, `user:status` to DM peers |
| U6 | online (socket only) | last socket closes, in a seated game / seat | reconnecting (until grace ends) | grace starts (policy §3) |
| U7 | reconnecting | socket connects inside grace | online | grace cancelled per §3 (#422 page-bounce rule kept) |
| U8 | reconnecting | grace expires | offline (or online if a beat is fresh) | policy result §3 |
| U9 | online (beat only) | beat expires (45 s TTL, ≤ 15 s prune) | offline | online_patch |
| U10 | online, socket page hidden | beat tab visible+active | online, active (union) | — |
| U11 | beat tabs A active, B away | B sends away edge | online, active (per-tab beats, fixes F2) | — |
| U12 | any | hide_online on/off | hidden flips | online_patch (socket or beat user) |
| U13 | any | logout / account lock | offline | `dropHeartbeat`, socket kicked |
| U14 | any | server restart | offline for all until reconnect | rebuilt from connects + first beats (≤ 20 s); never counts as abandonment |
| U15 | online | client sends `presence:'disconnected'` or junk | treated as `active`/ignored | coerced (`RoomHandler.js:139`) |
| U16 | online, idle | join match queue / leave | activity searching / idle | none pushed (friends poll) |
| U17 | online | game starts / ends / room interrupted | activity playing (incl. interrupted) / idle | none pushed |
| U18 | online | tournament match starts / ends | activity tournament / idle | none pushed |
| U19 | online | second tab same account connects (no `reconnect`) | online (new socket) | older tab `session:kicked` → login page |

### 2f. Transition table (room-member scope)
| # | before | event | after | effects |
|---|---|---|---|---|
| M1 | — | `room:join`/`room:create` from the room page | active | `roomPageId` set |
| M2 | active | room page hidden/unfocused report | away | `room:updated` |
| M3 | away | room page visible report | active | `room:updated` |
| M4 | active/away | member's socket is another page (lobby/home) | away (#373) | `room:updated` |
| M5 | active/away | last socket drops | gone + graceUntil (seated) / gone (viewer, no timeout #115) | `game:interrupted` if in game |
| M6 | gone (in game grace) | page bounce: non-room page connects | gone, same deadline (#422) | none |
| M7 | gone (grace) | room page reconnects in time | active | `game:resumed` / `game:init` |
| M8 | gone (grace) | grace expires | gone, seat released, stays as viewer (#367) | result per §3 |
| M9 | gone | late client report | gone (guard, `RoomManager.js:465`) | none |
| M10 | gone (viewer) | room page returns any time | active (#115) | `room:updated` |
| M11 | any | explicit `room:leave` | removed | resign if in game |

### 2g. Multi-tab, multi-device, restart
- One socket per account: the newest connection evicts the older (`session:kicked`, other sessions revoked); a
  same-tab reconnect (`auth.reconnect`) is not a kick. Multi-device behaves the same way.
- Any number of beat-only tabs: per-tab beat ids (random `tab` id in the POST body; `heartbeats` becomes
  userId → Map(tab → {at, away})). User is active if any surface is active.
- Server restart: all presence, rooms, games and grace timers are lost. Clients reconnect with backoff;
  socket users reappear on connect, beat users at their next tick (≤ 20 s). Live games are void
  (`ROOM_GONE`); a restart never counts as an abandonment or abort.

### 2h. Latency targets (the success criterion "same label everywhere within target")
| surface | target | why |
|---|---|---|
| room seats, spectators | ≤ 1 s after the server knows | 80 ms debounce |
| lobby list, rooms roster, home counts | ≤ 2 s | 1.5 s debounce |
| social, pickers | ≤ 11 s (visible tab) | 10 s poll + debounce; no per-friend push (fan-out cost) |
| DM window | on open/query; offline pushed on disconnect | T2/T7 |
| server learns of a silent loss (socket pages) | ≤ ~45 s | engine.io ping; unchanged |
| server learns of a closed beat page | ≤ 60 s | 45 s TTL + 15 s prune |

---

## 3. Leave and disconnect policy (proposal — decisions in §6)

Terms: **rated** = `RatingService.isRatedSetup` (ranked room, rated rule, two members). **Abortable** = the game
has not yet seen one action by each player (a move or an opening decision, so Swap2 counts). **Absence** = the
seat's member state is `gone` (socket closed or silent loss detected). Away (tab hidden) is never absence: it is
logged (§4) and never ends a game.

Absence window W by time control (Chess.com formula adapted; Lichess uses a speed factor — see the note):
- `per_game` / `blitz`: W = clamp(0.1 × (base + 40 × increment), 30 s, 120 s). Examples: 3 min → 30 s, 10 min → 60 s, 20 min → 120 s.
- `per_move` (default, 60 s per move): the running clock already bounds the absent player's turn; W = per-move seconds.

| case | before first actions (abortable) | mid-game, absent player's turn | mid-game, opponent's turn | both gone | repeat drops |
|---|---|---|---|---|---|
| Rated room (incl. rated quick-match, rated series game) — **recommended** | clock runs; after 30 s → **abort** (void, unrated), counts toward abort limit | clock keeps running; W counts only on the absent player's turn; first of clock-out or W → **result per Q1** | opponent's clock runs; when they move, the turn passes to the absent player and W counts | both gone 15 s → void, unrated | W does not refill within a game: one budget per player per game |
| Casual room — **recommended** | as today (pause), abort if still absent after grace | clock paused, cumulative grace budget 60 s per player per game; expiry → result per Q3 | same | void | budget, not per drop |
| Quick-match session | as its game type, then the session closes (`match_abandoned`, existing) | | | | |
| Challenge series | game result per its type; leaving ends the series with the result from games played (existing `finishSeries(...,'abandoned')`) | | | | |
| Tournament | **unchanged** (clock runs, no grace, timeout = loss, no-show replays capped at 2) — standing decision; Q9 | | | | |
| Explicit Leave mid-game | resign = loss (unchanged) | | | | |
| Back mid-game (#422) | counts as absence with the same window; the room page's return resumes | | | | |
| Server restart | void, never counted | | | | |
| Phone backgrounding (app switch, lock, call, frozen tab) | away while the socket lives (no effect on the result); if the socket dies, the absence starts when the server detects it (≤ ~45 s); the clock already ran meanwhile, as at a real board | | | | |

Repeat abandonment (members): aborts are void and void games are never saved (`handleGameEnd` with `noScore`
skips `saveGame`), so the games table cannot count them. Store a small `abandonment_events(user_id, game_id,
kind 'abandon'|'abort', at)` table (migration via the `PRAGMA user_version` runner), pruned after 7 days by an
hourly job like `dmService.pruneExpired` (`server/index.js:335-338`; there is no shared retention job). Rolling
24 h count. Effects per Q5. **Guests**: cannot play rated; limits keyed per guest user id (24 h session) in
memory only; **no per-IP penalty** (CGNAT, #372 lesson / `proxy-client-ip-rate-limit`).

Mass drop without a restart (Q13): a Cloudflare tunnel reconnect or VPS network blip drops every socket at once
while rooms survive; players come back at different speeds, and under Q1/Q2 A the slow ones would take rated
losses (the both-gone rule does not help once their opponent is back). Proposal: if ≥ 30 % of live sockets (and ≥
10) drop within 5 s, open a 2 min "outage" window in which absence expiries end rated games as void, not loss.

### 3a. Pre-mortem — "it failed in production, why?"
| failure | cause | mitigation in this design |
|---|---|---|
| Wave of unfair rated losses | tunnel / network blip, not a restart | Q13 outage window |
| Player loses on a phone call during own turn | clock runs during absence (Q2 A) | same as a real board and both platforms; per_move clock bounds it; logged, staff can review; Q2 B remains available |
| Swap2 opening abort abuse | abort is free before first actions | "first actions" include opening decisions; aborts counted (Q5, Q12); opening clock (`refreshOpeningClock`) keeps running |
| Old cached room tab shows a frozen clock | old client stops its countdown on `game:interrupted` (`DisconnectHandler.js:346-347`) | PS-8 sends the running `timerSync` with the interrupt and a `timer:sync` after it; test with the old handler |
| Unknown result reason on old pages | new reasons `abandon` / `abort` | `replay.js:370-374` falls back to the raw string; PS-8 adds i18n + `reasonMap` entries; room overlay reads `winner` |
| Friends see stale labels | poll interval | stated target ≤ 11 s; no push by design |
| Presence flicker after deploy | restart drops everyone | U14: rebuilt on reconnect; beat pages ≤ 20 s |

## 4. Fair-play signal (read-only, in line with `RatingIntegrityService`)
- **Stored**: one row per player per rated game, written once in `handleGameEnd` next to `saveGame` (off the move
  path): `game_presence(game_id, user_id, disconnects, disconnect_ms, away_count, away_ms, away_ms_own_turn,
  longest_away_ms)`. Counters accumulate in memory on the engine during the game; no raw event stream.
- **Retention**: per Q6 (recommend 90 days); a new hourly prune, same pattern as `dmService.pruneExpired`.
- **Who sees it**: staff with `rating.integrity` only — per-game strip in the admin replay, per-player aggregates
  (e.g. share of own-turn time spent away across N games) in the integrity report. Opponents and the public never.
- **Players are told**: one line in the rules/FAQ and the settings privacy text: "In rated games we record how
  often you disconnect or leave the tab, for fair-play review by staff. It never changes a result by itself and
  is deleted after 90 days."
- **Penalties**: human only. Signals are spoofable (userscripts fake focus) and have innocent causes (split
  screen, second window, system dialogs, calls).

## 5. Broadcast cost — baseline per transition (derived from code, to be measured in PS-1)
N = room members, L = lobby subscribers, H = home subscribers, P = DM peers.
| transition | inbound | outbound today | target |
|---|---|---|---|
| room page tab switch | 2 (P1+P2) | `room:updated`×N (+ `online_patch`×L, `home:stats`×H if the visible set/count changes, debounced) | 1 inbound, same outbound |
| index.html tab switch | 1 socket + 1 HTTP | `online_patch`×L (+H) | same |
| socket drop mid-game | — | `game:interrupted`×N + `room:updated`×N + `online_patch`×L + `user:status`×P | same |
| reconnect mid-game | — | `game:resumed`×(N−1) + `game:init`×1 + `room:updated`×N + `online_patch`×L | same |
| friend status change | — | none (poll) | none (poll) |
New fields (`st`, `graceUntil`) ride on existing payloads; no new broadcast.

---

## 6. Open questions (answer before formalizing items)
| # | question | options | recommendation |
|---|---|---|---|
| Q1 | Rated game, absence window expires mid-game | A automatic loss for the absent player (Chess.com) · B opponent gets "Claim win / Draw / Wait" (Lichess) · C void, no rating (today) | **A** — closes problem 1; the clock already ran, no extra wait for the opponent |
| Q2 | Rated game, clock during absence | A keeps running + W (above) · B paused, one cumulative budget per game · C paused per drop (today) | **A** — closes problem 2; matches both platforms |
| Q3 | Casual game | A pause kept, cumulative 60 s budget, expiry = void · B same as rated · C unchanged | **A** — friendly games stay forgiving, abuse capped |
| Q4 | "Away" outside the room | A friends see "Vắng" (and Playing · Vắng); lobby list/count keep #372 (away = not listed) · B away = offline everywhere outside the room (today) · C away listed everywhere (Discord idle) | **A** — fixes "alt-tab mid-game = offline to friends" without reopening #372 |
| Q5 | Repeat abandonment (members) | A ≥ 3 abandons/aborts in 24 h → W halved (floor 15 s) + 10 min quick-match cooldown · B record only, staff review · C escalating matchmaking bans | **A** |
| Q6 | Fair-play retention | A 90 days · B 30 days · C as long as the game | **A** |
| Q7 | Hide-online inside your own room | A room members still see your seat status (today) · B hidden there too | **A** — opponents need it |
| Q8 | Colour-only cue vs dot-only seats (#113 addendum) | A distinct glyph shape per state + aria-label, no visible text · B short visible text | **A** — keeps the user's dot-only choice |
| Q9 | Tournament | A leave as is · B align with the rated policy | **A** (standing decision) |
| Q10 | Deliberate close (`pagehide` "bye" → 10 s window, Lichess) | A no · B yes | **A** — #372 rejected pagehide: page-to-page navigation would read as quitting |
| Q11 | Both players gone | A void after 15 s · B wait the full window | **A** |
| Q12 | Abort before first actions | A abort = void, counted toward Q5 · B abort = loss for the leaver | **A** |
| Q13 | Mass drop without restart (tunnel/network blip) | A outage window: rated absence expiries become void for 2 min after ≥ 30 % of sockets drop in 5 s · B no special case | **A** |

### Answers (2026-11-27)
User: "Approve at all. (I have review your recommend, it all okay)" → every recommendation stands:
Q1 A (automatic loss) · Q2 A · Q3 A · Q4 A · Q5 A · Q6 A (90 days) · Q7 A · Q8 A · Q9 A · Q10 A · Q11 A · Q12 A · Q13 A.
Items: #486-#498 (PS-1…PS-13), branch `feature/486-presence-status` off `dev`.

## 7. Planned items (phase 2, after approval; one commit each, app works after each)
| id | item | size |
|---|---|---|
| PS-1 | Emit-count harness (fake timers) for the §5 transitions + F3 check; kept as tests | S |
| PS-2 | `server/presence/presence-core.js` + adapter: user/member derivation, §2e/§2f tests, per-tab beats (F2) | M |
| PS-3 | Wire `st` / `graceUntil` (additive) + `client/js/presence-view.js` + i18n `presence.*` | S |
| PS-4 | Consumer: friends (`/api/friends`, social.js, challenge-modal, home-challenge) incl. playing during interrupted, tournament, searching | S |
| PS-5 | Consumer: lobby list, rooms-h roster, home counts, DM window | S |
| PS-6 | Consumer: room seats + spectators through presence-view (glyphs, Q8) — design-workflow if visuals change | S |
| PS-7 | Remove the room-page double report (F1) | S |
| PS-8 | Rated disconnect policy: running clock, W, abandon/abort results, both-gone void, outage window (Q13), old-client clock compat, reason i18n (diag-page-sync check) | M |
| PS-9 | Casual cumulative grace budget | S |
| PS-10 | `abandonment_events` table + migration + 7-day prune, counters + effects (Q5) | S |
| PS-11 | Fair-play summary table + migration + admin view + player text | M |
| PS-12 | Real-browser pass: 2 players + 1 spectator (tab switch, tab close, network loss), screenshots | S |
| PS-13 | Remove deprecated wire fields once no cached client reads them | S |

## 8. Not verified
- F3 (fresh room page brief `away`) — reasoning only.
- All latencies and message counts in §2h/§5 are derived from code, not measured (PS-1 measures).
- Lichess `goneWeight` (repeat-leaver factor) and whether its clock runs during disconnect: not found in the
  two files read. Chess.com: official article read only via search summary; forum claims (shorter window when
  losing, app-switch detector) unconfirmed.
- Real phone behaviour (frozen tab, lock screen, call) — needs a device pass in PS-12.
