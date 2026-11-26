You are a senior real-time game backend and front-end engineer refactoring player status (presence) in gomoku-vn.

<context>
Player status is currently computed in several places with different vocabularies, so the same person can look different on different pages. The goal is one source of truth for status, synced to every backend consumer and every screen, modelled on how established game platforms treat presence, disconnection and leaving a game. Follow CLAUDE.md and .claude/rules; reply to me in Vietnamese and keep code and tracking text in English.
</context>

<current_system>
Surveyed on branch dev at c1a2c3af. Treat it as a starting map and confirm a fact in code before you change that area.

Site-wide presence: server/socket/state.js holds sessions, awayUsers, heartbeats (45 s TTL; pages without a socket post about every 20 s from client/js/platform-shell.js) and hiddenOnline. Derived helpers: isPresent, isVisiblyOnline, hasPresentSocket, broadcastOnlineUsers (1.5 s debounce).

Room presence: room.users[].presence is active, away or disconnected (RoomManager.setPresence, RoomHandler onPresence).

Client reporters: client/js/room-socket.js emits room:presence every 2 s, client/js/socket-client.js emits presence:set every 5 s, platform-shell.js sends the HTTP beat. Both socket events reach the same server handler; check whether the room page double-reports.

Disconnect handling (server/socket/handlers/DisconnectHandler.js, server/config.js):
- Player in an ongoing game: 60 s grace, clock paused, room.state = interrupted. On expiry the game ends with winner null, reason disconnect, no score, and the seat is released.
- Sole occupant of a room: 20 s. Seated before the game starts: 30 s, then the seat is released and the user stays as viewer. Viewers can always come back (#115).
- Explicit room:leave during a game is a resignation (loss).

Separate status models: FriendService.activityFromRoom (playing, watching, free; client/js/social.js polls every 10 s), DM user:status offline, tmatch:presence (tournament spectators), club members pane with no presence (#446).

UI consumers: rooms-h.js, lobby-home.js, home-challenge.js, social.js, private-chat.js, room-ui.js (playerStatusInfo, renderStatusDot), tournament-match.js. Search for others.

Problems seen while surveying (verify each one):
1. Closing the tab in a lost game voids it without a loss, while pressing Leave counts as a loss.
2. A disconnect pauses the clock, which gives unclocked thinking time. I found no per-game cap on how often the grace restarts.
3. A player in disconnect grace is reported as free to friends, because activityFromRoom requires room.state = playing.
</current_system>

<platform_reference>
- Discord statuses: online, idle, do not disturb, invisible (shown as offline), offline. https://docs.discord.com/developers/events/gateway-events
- Steam: a persona state (offline, online, busy, away, snooze, looking to trade or play) kept separate from rich presence, which describes what the player is doing. https://partner.steamgames.com/doc/api/ISteamFriends
- Chess.com abandonment: reconnect window (base seconds + 40 x increment) x 0.1, clamped to 30 s - 3 min, counted on the disconnected player's turn; 15 s in a completely lost position; both players gone for 15 s is an unrated draw; an expired first-move timer aborts the game, or counts as a loss for repeat offenders. https://support.chess.com/en/articles/8593801-how-does-game-abandonment-work
- Lichess lets the opponent claim victory after a wait. I only have forum reports for the details, so verify them before relying on any number.
- Browsers: visibilitychange is the most reliable lifecycle signal on mobile; pagehide, unload and beforeunload are unreliable; frozen tabs stop running timers. https://developer.chrome.com/docs/web-platform/page-lifecycle-api
- Tab and focus signals are spoofable by userscripts, and focus is also lost for innocent reasons (split screen, another window, system dialogs).
Search the web for more where a decision depends on it, and cite what you use.
</platform_reference>

<instructions>
This is a size L change. Work in two phases and stop at the end of phase 1 for my approval.

Phase 1, research and design (documents only), using the deep-reasoning skill:
1. Read docs/knowledge/INDEX.md and the matching notes (be-realtime, realtime-reliability-resync, broadcast-fanout-perf, pattern-state), reference-known-traps.md in the Claude auto-memory directory if available, and the todo or fix-log entries for #113, #114, #115, #157, #367, #372, #373, #422 through scripts/track.js.
2. Audit every producer, store, transport and renderer of status. Report it as a table with file:line, vocabulary, update trigger and latency.
3. Design one canonical model with independent axes, for example: connection (connected, reconnecting, offline), attention (active, away), activity (idle, searching, playing, watching, tournament) and visibility (hidden or not). Define one server derivation, one wire shape, one client renderer, the precedence between axes, a state-transition table, the multi-tab and multi-device rule, behaviour after a server restart, and what each audience (opponent, spectators, friends, lobby, strangers) is allowed to see.
4. Design the leaving and disconnect policy for each case: casual, rated, matchmade, challenge series, tournament; before the first move, mid-game, my turn or the opponent's turn, both players gone, server restart, and phone backgrounding (app switch, screen lock, incoming call, frozen tab), which is a common innocent cause. Guests have no durable account, so say how repeat-abandonment limits apply to them. Cover grace length by time control, whether the clock keeps running, claim-victory versus automatic result, and limits on repeated disconnects.
5. Design the fair-play signal: record away and disconnect events during rated games as weak evidence for human review, in line with the read-only posture of RatingIntegrityService. Say what is stored, for how long, who sees it and what the players are told. Penalties stay a human decision, because these signals are spoofable and have innocent causes.
6. Write the design to features/presence-status/ (following .claude/rules/design-intake.md) and a knowledge note in docs/knowledge/ with sources. Then ask me to decide the policy questions, giving 2-3 options and your recommendation for each. Void versus loss on abandonment is mine to decide.

Phase 2, after I approve:
7. Split the work into tracked items and implement in order: server model with tests, wire protocol, then one consumer at a time, then disconnect policy, then fair-play logging. Keep the app working after each item, including clients still running the old cached script during a deploy.
</instructions>

<rules>
- Keep these behaviours, each fixes a past bug: an evicted socket cannot overwrite the live one's status; page bounces do not restart the in-game grace (#422); room presence follows the room-page socket (#373); hide-online is respected everywhere; DM push depends on a present socket rather than a heartbeat; viewers can return to a live room (#115).
- The server decides status and results; the client only reports signals, because client signals can be forged.
- Keep broadcast cost at or below today's: send changes only, debounce, and measure messages per transition before and after.
- Colour is never the only cue for a status; give each one a text label through i18n.
- Clock or grace changes follow .claude/rules/diagnostic-page-sync.md. Client edits require node scripts/cache-bust.js --write. New UI follows design-workflow.
- Work on a feature/* branch off dev, one commit per item, and commit or merge when I ask.
</rules>

<success_criteria>
- One module derives status and every surface in the audit table reads from it; no page computes its own variant.
- The same user in the same state shows the same label and colour on every page, within a latency target stated in the design.
- Tests cover the transition table, including multi-tab, reconnect inside and outside the grace, server restart and hidden-online. Existing DisconnectHandler, SocketHandler and online-users-delta tests pass, or each changed assertion is explained.
- npm test passes, and a real-browser pass with two players and one spectator (tab switch, tab close, network loss) is shown with screenshots, following playwright-e2e-safety.
</success_criteria>

<output_format>
For phase 1: a short Vietnamese summary, the audit table, the state and transition tables, the policy options with recommendations, the planned items with size, and what you could not verify.
</output_format>

Start phase 1 now.
